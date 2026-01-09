import { useEffect, useState, useRef } from 'react';
import { ref, onValue, onDisconnect, set, serverTimestamp } from 'firebase/database';
import { rtdb } from '../firebase';

export const usePresence = (roomId: string, userId: string, roomData: any, addToast: (msg: string) => void) => {
  const [offlineUsers, setOfflineUsers] = useState<Set<string>>(new Set());
  const [isHostMissing, setIsHostMissing] = useState(false);
  
  const [onlineMembers, setOnlineMembers] = useState<Set<string>>(new Set());
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // 通知制御用
  const prevOnlineMembersRef = useRef<Set<string> | null>(null);
  const kickedOutIdsRef = useRef<Set<string>>(new Set());
  
  // ★リロード対策：退室判定を保留するためのタイマー管理
  const disconnectTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // 最新のRTDBデータを保持（タイマーコールバック内で参照するため）
  const latestSnapshotMembers = useRef<Set<string>>(new Set());

  // 初回マウント時の通知抑制フラグ
  const canNotify = useRef(false);

  // 通知許可タイマー
  useEffect(() => {
    const timer = setTimeout(() => {
      canNotify.current = true;
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // 1. 自分の在席登録と接続管理
  useEffect(() => {
    if (!roomId || !userId) return;

    const myStatusRef = ref(rtdb, `rooms/${roomId}/online/${userId}`);
    const connectedRef = ref(rtdb, '.info/connected');

    const unsubscribeConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        // サーバー側での切断時削除予約
        // （.cancel() を挟むことで、前回の予約が残っていた場合の競合を防ぐのがベストプラクティスです）
        onDisconnect(myStatusRef).cancel()
          .then(() => {
             return onDisconnect(myStatusRef).remove();
          })
          .then(() => {
            // 予約完了後に自分の情報をセット
            set(myStatusRef, { id: userId, joinedAt: serverTimestamp() });
          })
          .catch((err) => console.error('onDisconnect setup failed', err));
      }
    });

    // アプリ切り替え等で戻ってきた時の保険
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        set(myStatusRef, { id: userId, joinedAt: serverTimestamp() }).catch(console.error);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ★重要： window.addEventListener('beforeunload'...) は削除しました。
    // 手動削除を行わず、サーバー側の onDisconnect に任せることで、
    // リロード時の「削除→再接続」の競合（点滅）を防ぎます。

    return () => {
      unsubscribeConnected();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // アンマウント時（ページ内遷移）は削除予約をキャンセル
      onDisconnect(myStatusRef).cancel();
    };
  }, [roomId, userId]);

  // 2. 他メンバーの監視 (RTDB) & ★デバウンス処理
  useEffect(() => {
    if (!roomId) return;
    const roomOnlineRef = ref(rtdb, `rooms/${roomId}/online`);
    
    const unsubscribe = onValue(roomOnlineRef, (snapshot) => {
      const val = snapshot.val();
      const newSnapshotMembers = new Set<string>();
      if (val) Object.keys(val).forEach(key => newSnapshotMembers.add(key));

      // 最新状態をRefに保存（遅延実行時に参照するため）
      latestSnapshotMembers.current = newSnapshotMembers;

      setOnlineMembers((prevOnlineMembers) => {
        const nextMembers = new Set(prevOnlineMembers);
        
        // A. 新しく入った人（または戻ってきた人）の処理
        // 即座に反映（リロード復帰を素早く検知するため）
        newSnapshotMembers.forEach(id => {
          if (!nextMembers.has(id)) {
            nextMembers.add(id);
          }
          // もし退出保留中タイマーがあればキャンセル（「やっぱり居た」扱い）
          if (disconnectTimers.current.has(id)) {
            clearTimeout(disconnectTimers.current.get(id)!);
            disconnectTimers.current.delete(id);
          }
        });

        // B. 消えた人の処理
        // 即座に消さず、タイマーをセットして「本当にいなくなったか」確認する
        prevOnlineMembers.forEach(id => {
          if (!newSnapshotMembers.has(id)) {
            // すでにタイマーが回っていなければセット
            if (!disconnectTimers.current.has(id)) {
              const timer = setTimeout(() => {
                // 3秒後に再チェック
                if (!latestSnapshotMembers.current.has(id)) {
                  // 本当にいないならStateから削除
                  setOnlineMembers(current => {
                    const updated = new Set(current);
                    updated.delete(id);
                    return updated;
                  });
                }
                disconnectTimers.current.delete(id);
              }, 3000); // ★ここの秒数だけリロード時の「不在」表示を耐えます

              disconnectTimers.current.set(id, timer);
            }
          }
        });

        // Stateを返す（追加分は即反映、削除分はタイマー任せなのでここではまだ消さない）
        return nextMembers;
      });

      setIsDataLoaded(true);
    });

    return () => unsubscribe();
  }, [roomId]);

  // 3. オフライン判定 & 通知 (ロジックはほぼ変更なし)
  useEffect(() => {
    if (!roomData || !roomData.members || !isDataLoaded) return;

    const currentOffline = new Set<string>();
    let hostIsOffline = false;
    
    roomData.members.forEach((member: any) => {
      if (member.id === userId) return; 
      if (!onlineMembers.has(member.id)) {
        currentOffline.add(member.id);
        if (member.isHost) hostIsOffline = true;
      }
    });

    // 通知ロジック
    // （onlineMembersがデバウンスされているため、通知も自動的にリロードを無視します）
    if (canNotify.current && prevOnlineMembersRef.current !== null) {
      const prev = prevOnlineMembersRef.current;
      
      roomData.members.forEach((member: any) => {
        if (member.id === userId) return;

        const isNowOnline = onlineMembers.has(member.id);
        const wasOnline = prev.has(member.id);

        if (wasOnline && !isNowOnline) {
          addToast(`${member.name} が退出しました`);
          kickedOutIdsRef.current.add(member.id);
        }

        if (!wasOnline && isNowOnline) {
          if (kickedOutIdsRef.current.has(member.id)) {
            addToast(`${member.name} が復帰しました！`);
            kickedOutIdsRef.current.delete(member.id);
          }
        }
      });
    }

    prevOnlineMembersRef.current = onlineMembers;
    setOfflineUsers(currentOffline);
    setIsHostMissing(hostIsOffline);

  }, [roomData, onlineMembers, userId, addToast, isDataLoaded]);

  return { offlineUsers, isHostMissing };
};