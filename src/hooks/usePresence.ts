// ../hooks/usePresence.ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

type AddToast = (msg: string) => void;

type FirestoreTimestampLike =
  | { toMillis: () => number }
  | { seconds: number; nanoseconds?: number }
  | number
  | null
  | undefined;

const toMillisSafe = (t: FirestoreTimestampLike): number | null => {
  if (!t) return null;
  if (typeof t === 'number') return Number.isFinite(t) ? t : null;
  if (typeof (t as any).toMillis === 'function') {
    try {
      const ms = (t as any).toMillis();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  if (typeof (t as any).seconds === 'number') {
    const sec = (t as any).seconds;
    const ns = typeof (t as any).nanoseconds === 'number' ? (t as any).nanoseconds : 0;
    const ms = sec * 1000 + Math.floor(ns / 1e6);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
};

const now = () => Date.now();

/**
 * Presence design:
 * - "退出" は明示操作のみ（membersから削除するのは別ロジックに任せる）
 * - アプリ切替/バックグラウンドは退出ではないので何も消さない
 * - オンライン/オフライン判定は heartbeats の鮮度で行う
 */
export const usePresence = (
  roomId: string,
  userId: string,
  roomData: any,
  addToast?: AddToast
) => {
  const [offlineUsers, setOfflineUsers] = useState<Set<string>>(new Set());
  const [isHostMissing, setIsHostMissing] = useState(false);

  // ---- Tunables (ここ大事) ----
  // スマホはバックグラウンドでタイマー停止が起きるので、オフライン判定は長め推奨
  const HEARTBEAT_EVERY_MS = 15_000; // 15s
  const OFFLINE_AFTER_MS = 120_000;  // 2min: ここを長くすると誤オフラインが減る
  // hiddenになった直後に1回だけ延命heartbeatを打つ（アプリ切替の誤オフライン抑制）
  const HIDDEN_GRACE_HEARTBEAT_DELAY_MS = 10_000; // 10s

  const hbIntervalRef = useRef<number | null>(null);
  const hiddenGraceTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  const lastRoomIdRef = useRef<string>('');
  const lastUserIdRef = useRef<string>('');

  const hostMissingToastRef = useRef(false);

  const roomRef = useMemo(() => {
    if (!roomId) return null;
    return doc(db, 'rooms', roomId);
  }, [roomId]);

  const clearTimers = () => {
    if (hbIntervalRef.current !== null) {
      window.clearInterval(hbIntervalRef.current);
      hbIntervalRef.current = null;
    }
    if (hiddenGraceTimerRef.current !== null) {
      window.clearTimeout(hiddenGraceTimerRef.current);
      hiddenGraceTimerRef.current = null;
    }
  };

  const writeHeartbeat = async (reason: string) => {
    if (!roomRef || !roomId || !userId) return;
    try {
      // NOTE:
      // - members は絶対に触らない（ここが今回の肝）
      // - heartbeats と lastActive だけ更新
      await updateDoc(roomRef, {
        [`heartbeats.${userId}`]: serverTimestamp(),
        lastActive: serverTimestamp(),
      });
      // debugしたいならここで console.log(reason)
      void reason;
    } catch (e) {
      // オフライン/バックグラウンドでは普通に失敗するので握りつぶしでOK
      // console.warn('[presence] heartbeat failed', e);
      void e;
    }
  };

  const startHeartbeatLoop = () => {
    if (!roomId || !userId || !roomRef) return;

    // すでに回ってたら何もしない
    if (hbIntervalRef.current !== null) return;

    // 即時1回
    void writeHeartbeat('start-loop');

    hbIntervalRef.current = window.setInterval(() => {
      // hidden中は打たない（バックグラウンドで無駄にリトライしない）
      if (document.visibilityState !== 'visible') return;
      void writeHeartbeat('interval');
    }, HEARTBEAT_EVERY_MS);
  };

  const stopHeartbeatLoop = () => {
    if (hbIntervalRef.current !== null) {
      window.clearInterval(hbIntervalRef.current);
      hbIntervalRef.current = null;
    }
  };

  // ---- lifecycle: start/stop heartbeat safely ----
  useEffect(() => {
    mountedRef.current = true;

    // roomId / userId が変わったらリセット
    const changed = lastRoomIdRef.current !== roomId || lastUserIdRef.current !== userId;
    if (changed) {
      lastRoomIdRef.current = roomId;
      lastUserIdRef.current = userId;
      clearTimers();
    }

    if (!roomId || !userId || !roomRef) return () => void 0;

    const onVisible = () => {
      // visibleに戻ったら即ハートビートしてループ再開
      if (document.visibilityState === 'visible') {
        if (hiddenGraceTimerRef.current !== null) {
          window.clearTimeout(hiddenGraceTimerRef.current);
          hiddenGraceTimerRef.current = null;
        }
        void writeHeartbeat('visible');
        startHeartbeatLoop();
      } else {
        // hidden: 退出扱いにはしない。ただしループは止める
        stopHeartbeatLoop();

        // アプリ切替は短時間で戻ることが多いので「延命1回」を予約
        // （戻ってきたらキャンセルされる）
        if (hiddenGraceTimerRef.current !== null) {
          window.clearTimeout(hiddenGraceTimerRef.current);
        }
        hiddenGraceTimerRef.current = window.setTimeout(() => {
          // hiddenのままなら1回だけ延命（これで“他アプリ開いた瞬間に退出扱い”が激減）
          if (document.visibilityState !== 'visible') {
            void writeHeartbeat('hidden-grace');
          }
        }, HIDDEN_GRACE_HEARTBEAT_DELAY_MS);
      }
    };

    // Safari/モバイル含め比較的安定
    document.addEventListener('visibilitychange', onVisible);

    // BFCache復帰などにも対応（iOSで効くことがある）
    const onPageShow = () => {
      void writeHeartbeat('pageshow');
      startHeartbeatLoop();
    };
    window.addEventListener('pageshow', onPageShow);

    // 初期状態
    if (document.visibilityState === 'visible') startHeartbeatLoop();
    else stopHeartbeatLoop();

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      clearTimers();
      mountedRef.current = false;
    };
  }, [roomId, userId, roomRef]);

  // ---- derive offline users from roomData.heartbeats ----
  useEffect(() => {
    if (!roomData) {
      setOfflineUsers(new Set());
      setIsHostMissing(false);
      return;
    }

    const mems: any[] = Array.isArray(roomData.members) ? roomData.members : [];
    const hb = (roomData.heartbeats && typeof roomData.heartbeats === 'object') ? roomData.heartbeats : {};
    const hostId: string | null = roomData.hostId ?? null;

    const cutoff = now() - OFFLINE_AFTER_MS;
    const nextOffline = new Set<string>();

    for (const m of mems) {
      const id = String(m?.id ?? '');
      if (!id) continue;

      // 自分はローカル的にはオンライン扱いにしてUIブレを減らす（必要なら外してOK）
      if (id === userId) continue;

      const ms = toMillisSafe(hb[id] as any);
      // heartbeatが無い or 古い => offline
      if (ms === null || ms < cutoff) nextOffline.add(id);
    }

    setOfflineUsers(nextOffline);

    // host missing = hostIdが存在して、かつそのユーザーがoffline
    const hostMissing = !!hostId && nextOffline.has(String(hostId));
    setIsHostMissing(hostMissing);

    // toastはスパム防止
    if (addToast) {
      if (hostMissing && !hostMissingToastRef.current) {
        hostMissingToastRef.current = true;
        addToast('ホストの接続が途切れています（復帰待ち）');
      }
      if (!hostMissing && hostMissingToastRef.current) {
        hostMissingToastRef.current = false;
        addToast('ホストが復帰しました');
      }
    }
  }, [roomData, userId]);

  return { offlineUsers, isHostMissing };
};

export default usePresence;
