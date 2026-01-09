import { useEffect, useState, useRef } from 'react';
import { ref, onValue, onDisconnect, set, remove, serverTimestamp } from 'firebase/database';
import { rtdb } from '../firebase';

export const usePresence = (roomId: string, userId: string, roomData: any, addToast: (msg: string) => void) => {
  const [offlineUsers, setOfflineUsers] = useState<Set<string>>(new Set());
  const [isHostMissing, setIsHostMissing] = useState(false);
  
  const [onlineMembers, setOnlineMembers] = useState<Set<string>>(new Set());
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // 通知制御用
  const prevOnlineMembersRef = useRef<Set<string> | null>(null);
  const kickedOutIdsRef = useRef<Set<string>>(new Set());
  
  // 初回マウント時の通知抑制フラグ
  const canNotify = useRef(false);

  // 通知許可タイマー
  useEffect(() => {
    const timer = setTimeout(() => {
      canNotify.current = true;
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // 1. 自分の在席登録と接続管理（★ここを修正）
  useEffect(() => {
    if (!roomId || !userId) return;

    const myStatusRef = ref(rtdb, `rooms/${roomId}/online/${userId}`);
    // Firebase自体の接続状態を監視する特別なパス
    const connectedRef = ref(rtdb, '.info/connected');

    // ■ 接続状態監視ハンドラ
    // 接続が確立・復帰するたびに実行される
    const unsubscribeConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        // 1. 切断時（タブ閉じやネット切れ）に削除されるよう予約
        onDisconnect(myStatusRef).remove()
          .then(() => {
            // 2. 予約完了後、自分の情報をセット（これで復帰時も即座に再登録されます）
            set(myStatusRef, { id: userId, joinedAt: serverTimestamp() });
          })
          .catch((err) => console.error('onDisconnect setup failed', err));
      }
    });

    // ■ 画面の表示状態監視ハンドラ (スマホのアプリ切り替え対策)
    // バックグラウンドから戻ってきた時に強制的にデータを書き込む
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 念のため再登録を行う（Socketが切れてデータが消えていた場合の保険）
        set(myStatusRef, { id: userId, joinedAt: serverTimestamp() }).catch(console.error);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ■ タブを閉じた時の即時削除
    const handleDisconnect = () => {
       remove(myStatusRef).catch(err => console.error(err));
    };
    // PC向け
    window.addEventListener('beforeunload', handleDisconnect);
    // スマホ向け (beforeunloadより信頼性が高い)
    window.addEventListener('pagehide', handleDisconnect);

    return () => {
      // クリーンアップ
      unsubscribeConnected();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleDisconnect);
      window.removeEventListener('pagehide', handleDisconnect);
      
      // コンポーネントのアンマウント時（画面内のページ遷移）では
      // 「退出」扱いにしたくないため、切断時の削除予約をキャンセルする
      onDisconnect(myStatusRef).cancel();
    };
  }, [roomId, userId]);

  // 2. 他メンバーの監視 (RTDB) - 変更なし
  useEffect(() => {
    if (!roomId) return;
    const roomOnlineRef = ref(rtdb, `rooms/${roomId}/online`);
    
    const unsubscribe = onValue(roomOnlineRef, (snapshot) => {
      const val = snapshot.val();
      const currentOnlineIds = new Set<string>();
      if (val) Object.keys(val).forEach(key => currentOnlineIds.add(key));
      setOnlineMembers(currentOnlineIds);
      setIsDataLoaded(true);
    });
    return () => unsubscribe();
  }, [roomId]);

  // 3. オフライン判定 & 差分通知ロジック - 変更なし
  useEffect(() => {
    if (!roomData || !roomData.members || !isDataLoaded) return;

    const currentOffline = new Set<string>();
    let hostIsOffline = false;
    
    // 現在のFirestoreメンバーとRTDBオンライン状況を比較
    roomData.members.forEach((member: any) => {
      if (member.id === userId) return; 
      if (!onlineMembers.has(member.id)) {
        currentOffline.add(member.id);
        if (member.isHost) hostIsOffline = true;
      }
    });

    // --- 通知ロジック ---
    if (canNotify.current && prevOnlineMembersRef.current !== null) {
      const prev = prevOnlineMembersRef.current;
      
      roomData.members.forEach((member: any) => {
        if (member.id === userId) return;

        const isNowOnline = onlineMembers.has(member.id);
        const wasOnline = prev.has(member.id);

        // 退出検知
        if (wasOnline && !isNowOnline) {
          addToast(`${member.name} が退出しました`);
          kickedOutIdsRef.current.add(member.id);
        }

        // 復帰検知
        if (!wasOnline && isNowOnline) {
          // 「退出通知済み」の人だけ復帰通知を出す
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