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

  // 1. 自分の在席登録
  useEffect(() => {
    if (!roomId || !userId) return;
    const myStatusRef = ref(rtdb, `rooms/${roomId}/online/${userId}`);
    
    // 接続時に「切断時の削除」を予約し、在席データをセット
    onDisconnect(myStatusRef).remove().then(() => {
        set(myStatusRef, { id: userId, joinedAt: serverTimestamp() });
    });

    // タブ/ブラウザを閉じた時の即時削除 (画面遷移では発火しない)
    const handleBeforeUnload = () => {
        remove(myStatusRef).catch(err => console.error(err));
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        // ★修正: 画面遷移(アンマウント)時には remove(myStatusRef) を実行しないようにしました。
        // これにより、アプリ内で画面が変わっても「退出」扱いにならなくなります。
        onDisconnect(myStatusRef).cancel();
    };
  }, [roomId, userId]);

  // 2. 監視 (RTDB)
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

  // 3. オフライン判定 & 差分通知ロジック
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