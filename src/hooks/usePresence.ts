import { useEffect, useRef, useState, useCallback } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const HEARTBEAT_INTERVAL = 2000;
const TIMEOUT_MS = 7000;

export const usePresence = (roomId: string, userId: string, roomData: any, addToast: (msg: string) => void) => {
  const [offlineUsers, setOfflineUsers] = useState<Set<string>>(new Set());
  const [isHostMissing, setIsHostMissing] = useState(false);
  
  // 通知済みユーザーIDを管理（重複・無限通知防止）
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  // 前回のメンバーリスト（退出検知用）
  const prevMembersRef = useRef<any[]>([]);
  // ホスト不在状態の管理
  const prevHostMissingRef = useRef(false);
  
  // マウント直後の判定スキップ用
  const isReadyToCheck = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => { isReadyToCheck.current = true; }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // --- ハートビート送信 ---
  const sendHeartbeat = useCallback(async () => {
    if (!roomId || !userId) return;
    try {
      const roomRef = doc(db, "rooms", roomId);
      await updateDoc(roomRef, {
        [`heartbeats.${userId}`]: serverTimestamp()
      });
    } catch (e) {
      // console.error("Heartbeat error", e);
    }
  }, [roomId, userId]);

  useEffect(() => {
    if (!roomId || !userId) return;
    sendHeartbeat();
    const timer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') sendHeartbeat();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [roomId, userId, sendHeartbeat]);

  // --- 統合監視ロジック ---
  const checkPresence = useCallback(() => {
    if (!roomData || !roomData.heartbeats || !roomData.members) return;

    // 初回実行時は現在のメンバーを保存して終了（いきなり退出通知が出ないように）
    if (prevMembersRef.current.length === 0 && roomData.members.length > 0) {
      prevMembersRef.current = roomData.members;
      // 初期メンバーは全員「通知済みではない（在席）」状態とみなす
      // ただし、もし再接続などで既にDB上でハートビート切れの場合は下部のロジックで検知される
    }

    if (!isReadyToCheck.current) return;

    const now = Date.now();
    const currentOffline = new Set<string>();
    const heartbeats = roomData.heartbeats;
    let hostIsOffline = false;
    
    // 現在のメンバーIDセット
    const currentMemberIds = new Set(roomData.members.map((m: any) => m.id));

    // ---------------------------------------------
    // 1. リストから消えた人 (Leave / Kick) を検知
    // ---------------------------------------------
    prevMembersRef.current.forEach((prevM: any) => {
      if (!currentMemberIds.has(prevM.id)) {
        // いなくなった
        if (prevM.id !== userId && !notifiedIdsRef.current.has(prevM.id)) {
          addToast(`${prevM.name} が退出しました`);
          notifiedIdsRef.current.add(prevM.id); // 通知済みに登録
        }
      }
    });

    // ---------------------------------------------
    // 2. ハートビート切れ (Timeout) を検知
    // ---------------------------------------------
    roomData.members.forEach((member: any) => {
      if (member.id === userId) return;

      const hb = heartbeats[member.id];
      let lastActive = 0;
      if (hb) {
        if (typeof hb.toMillis === 'function') lastActive = hb.toMillis();
        else if (hb instanceof Date) lastActive = hb.getTime();
        else if (typeof hb === 'number') lastActive = hb;
      }
      
      const isTimeout = (lastActive > 0 && now - lastActive > TIMEOUT_MS);

      if (isTimeout) {
        currentOffline.add(member.id);
        if (member.isHost) hostIsOffline = true;

        // まだ通知していなければ「退出」として通知
        if (!notifiedIdsRef.current.has(member.id)) {
          addToast(`${member.name} が退出しました`); // 表示上は「退出」で統一
          notifiedIdsRef.current.add(member.id);
        }
      } else {
        // 在席中 (Active)
        // もし「通知済み（退出扱い）」リストに入っていたら -> 「復帰」通知
        if (notifiedIdsRef.current.has(member.id)) {
          addToast(`${member.name} が復帰しました！`);
          notifiedIdsRef.current.delete(member.id); // 通知済みから削除（在席状態へ）
        }
      }
    });

    // ホストの状態変化
    if (hostIsOffline !== prevHostMissingRef.current) {
      setIsHostMissing(hostIsOffline);
      prevHostMissingRef.current = hostIsOffline;
    }

    setOfflineUsers(currentOffline);
    prevMembersRef.current = roomData.members; // 次回比較用に保存

  }, [roomData, userId, addToast]);

  useEffect(() => {
    checkPresence();
  }, [roomData, checkPresence]);

  useEffect(() => {
    const interval = setInterval(checkPresence, 1000);
    return () => clearInterval(interval);
  }, [checkPresence]);

  return { offlineUsers, isHostMissing };
};