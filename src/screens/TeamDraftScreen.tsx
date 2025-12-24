import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase'; 
import { useWakeLock } from '../hooks/useWakeLock';

// --------------------
// ROLES v4 (Data) - 変更なし
// --------------------
export const ROLES = [
  {
    id: 'maestro',
    name: 'THE MAESTRO',
    type: 'ATK',
    sigil: '⬢',
    tone: 'from-cyan-500/30 to-blue-600/10',
    desc: '旋律を支配する絶対王者。ミス無き演奏が、天井知らずのスコアを叩き出す。',
    passive: '【VIRTUOSO】成功でCOMBO蓄積。次回の成功時に +250 × COMBO。失敗で全ロスト。',
    skill: '【CRESCENDO】このターン、成功なら +1500 ／ 失敗なら -1500。',
    ult: '【FINALE】現在のCOMBOを消費し、チーム全員の次スコアに +800 × COMBO。',
  },
  {
    id: 'showman',
    name: 'SHOWMAN',
    type: 'ATK',
    sigil: '◆',
    tone: 'from-yellow-500/30 to-orange-600/10',
    desc: '舞台を沸かすエンターテイナー。堅実な稼ぎと、ここ一番の爆発力を併せ持つ。',
    passive: '【STAR POWER】成功時、常時 +800。失敗してもペナルティ 0。',
    skill: '【ENCORE】追加で +1200。失敗してもマイナスなし（0）。',
    ult: '【SPOTLIGHT】成功なら敵チームに -2000。失敗なら自分に -1000。',
  },
  {
    id: 'ironwall',
    name: 'IRON WALL',
    type: 'DEF',
    sigil: '▣',
    tone: 'from-emerald-500/25 to-cyan-500/10',
    desc: 'チームの盾となる守護神。たとえ歌が崩れても、その鉄壁は揺るがない。',
    passive: '【FORTRESS】味方が受けるマイナススコアを常時 30% カット。',
    skill: '【INTERCEPT】味方のミスを 0 にし、本来の半分のダメージを自分が受ける。',
    ult: '【BARRIER】次順まで、チームへの全マイナス効果を 0 にする。',
  },
  {
    id: 'coach',
    name: 'THE COACH',
    type: 'SUP',
    sigil: '✚',
    tone: 'from-purple-500/25 to-pink-500/10',
    desc: '勝利の方程式を描く指揮官。個人の技量に関わらず、チーム全体を底上げする。',
    passive: '【GUIDANCE】各ターン開始時、無条件でチームに +150。',
    skill: '【TIMEOUT】味方に「SAFE」付与。失敗しても +300 に変換。',
    ult: '【MORALE】チームに +2500。さらに全員のデバフを解除。',
  },
  {
    id: 'oracle',
    name: 'ORACLE',
    type: 'TEC',
    sigil: '⟁',
    tone: 'from-indigo-500/25 to-cyan-500/10',
    desc: '運命をハックする預言者。お題選びやイベントを操作し、盤面を支配する。',
    passive: '【FORESIGHT】自分のターンは常に「お題3択」から選べる。',
    skill: '【REROLL】自分、または味方のお題を引き直す（スコア変動なし）。',
    ult: '【FATE SHIFT】次のイベントを強制的に「有利なもの」に書き換える。',
  },
  {
    id: 'mimic',
    name: 'MIMIC',
    type: 'TEC',
    sigil: '◈',
    tone: 'from-slate-500/25 to-zinc-500/10',
    desc: '変幻自在のトリックスター。他者の才能を模倣し、己の力として還元する。',
    passive: '【MIRROR】直前の味方の獲得スコアの 30% を自分に上乗せ。',
    skill: '【ECHO】直前のスコア変動を 50% の効果でコピーして発動。',
    ult: '【STEAL ROLE】敵のスキルを盗み、1回だけ発動する。',
  },
  {
    id: 'hype',
    name: 'HYPE ENGINE',
    type: 'SUP',
    sigil: '✦',
    tone: 'from-rose-500/25 to-red-600/10',
    desc: '会場のボルテージを上げる着火剤。歌唱力関係なし、勢いだけで場を制す。',
    passive: '【VIBE】自分の手番が来るたび、チームに +400。',
    skill: '【CHANT】次の味方の成功時、ボーナス +1000。',
    ult: '【ROAR】以降、味方全員の成功スコアに常時 +500。',
  },
  {
    id: 'saboteur',
    name: 'SABOTEUR',
    type: 'TEC',
    sigil: '☒',
    tone: 'from-red-500/20 to-orange-500/10',
    desc: '影から崩す攪乱工作員。敵のペースを乱し、知らぬ間に勝利を奪い取る。',
    passive: '【JAMMING】自分が成功するたび、敵チームに -300。',
    skill: '【MARK】敵1人を指定。その敵が成功時、敵は +0、自チームに +800。',
    ult: '【BLACKOUT】敵チームに「最悪のイベント（大幅減点など）」を強制発動。',
  },
  {
    id: 'underdog',
    name: 'UNDERDOG',
    type: 'DEF',
    sigil: '⬟',
    tone: 'from-amber-500/20 to-yellow-500/10',
    desc: '逆境でこそ輝く反逆者。点差が開くほど牙を研ぎ、土壇場で全てを覆す。',
    passive: '【REBEL】負けている時、自分のターン開始時に +600。',
    skill: '【CLUTCH】劣勢時限定、チームに +2000。失敗時は -1500。',
    ult: '【REVERSAL】現在の点差の 20% 分を相手から奪う（最大4000）。',
  },
  {
    id: 'gambler',
    name: 'GAMBLER',
    type: 'TEC',
    sigil: '🎲',
    tone: 'from-teal-500/20 to-emerald-500/10',
    desc: 'スリルを愛する勝負師。丁か半か、その歌声ですべての運命を賭ける。',
    passive: '【ROLL】成功時に 0〜2000 の追加ボーナスを抽選。',
    skill: '【DOUBLE DOWN】スコア 2倍 ／ 失敗時 -2000（破滅的ペナルティ）。',
    ult: '【JACKPOT】コイントス。表なら +6000 ／ 裏なら -3000。',
  },
] as const;

// --------------------
// Animation Configuration
// --------------------

const pageVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } }
};

const cardContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { delayChildren: 0.5, staggerChildren: 0.05 },
  },
};

const cardVariants = {
  hidden: { y: 20, opacity: 0, scale: 0.95 },
  visible: {
    y: 0, opacity: 1, scale: 1,
    transition: { type: 'spring', stiffness: 120, damping: 15 },
  },
};

// --------------------
// Main Component
// --------------------
export const TeamDraftScreen = () => {
  const navigate = useNavigate();
  useWakeLock();

  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [isHost, setIsHost] = useState(false);

  const [members, setMembers] = useState<any[]>([]);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [currentPickIndex, setCurrentPickIndex] = useState(0);

  const [roleModal, setRoleModal] = useState<any | null>(null);
  const [isPickingBusy, setIsPickingBusy] = useState(false);
  const [showMobileTeams, setShowMobileTeams] = useState(false);
   
  // 遷移アニメーション管理
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Load User & Room Data
  useEffect(() => {
    const stored = localStorage.getItem('shibari_user_info');
    if (!stored) { navigate('/'); return; }
    const userInfo = JSON.parse(stored);
    setRoomId(userInfo.roomId);
    setUserId(userInfo.userId);
    setIsHost(!!userInfo.isHost);

    const unsub = onSnapshot(doc(db, "rooms", userInfo.roomId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setMembers(data.members || []);

      if (data.currentPickIndex !== undefined) setCurrentPickIndex(data.currentPickIndex);
      if (Array.isArray(data.draftOrder)) setDraftOrder(data.draftOrder);

      // ステータスが playing になったら演出を開始
      if (data.status === 'playing' && data.mode === 'team') {
        setIsTransitioning(true);
      }

      // ホストのみドラフト順生成
      if (userInfo.isHost && (!data.draftOrder || data.draftOrder.length === 0) && (data.members?.length ?? 0) > 0) {
        generateDraftOrder(data.members, userInfo.roomId);
      }
    });

    return () => unsub();
  }, [navigate]);

  // 演出完了後の遷移処理
  useEffect(() => {
    if (isTransitioning) {
      // 演出時間を長く確保（9秒: アニメーション完遂用）
      const timer = setTimeout(() => {
        navigate('/game-play-team');
      }, 9000);
      return () => clearTimeout(timer);
    }
  }, [isTransitioning, navigate]);

  const generateDraftOrder = async (currentMembers: any[], targetRoomId: string) => {
    const sortByTurn = (a: any, b: any) => (a.turnOrder ?? 9999) - (b.turnOrder ?? 9999);
    const teamA = currentMembers.filter(m => m.team === 'A').sort(sortByTurn);
    const teamB = currentMembers.filter(m => m.team === 'B').sort(sortByTurn);

    const order: string[] = [];
    let aIdx = 0, bIdx = 0;
    const pattern = ['A', 'B', 'B', 'A']; // Snake Draft
    let pIdx = 0;

    while (aIdx < teamA.length || bIdx < teamB.length) {
      const t = pattern[pIdx % pattern.length];
      if (t === 'A' && aIdx < teamA.length) order.push(teamA[aIdx++].id);
      else if (t === 'B' && bIdx < teamB.length) order.push(teamB[bIdx++].id);
      else {
        if (aIdx < teamA.length) order.push(teamA[aIdx++].id);
        if (bIdx < teamB.length) order.push(teamB[bIdx++].id);
      }
      pIdx++;
    }

    await updateDoc(doc(db, "rooms", targetRoomId), { draftOrder: order, currentPickIndex: 0 });
  };

  // Derived Values
  const currentPickerId = draftOrder[currentPickIndex];
   
  // 自分のターン OR ホストによる代理選択
  const canPick = currentPickerId === userId || isHost;
   
  const currentPickerMember = members.find(m => m.id === currentPickerId);

  const teamA = useMemo(() => members.filter(m => m.team === 'A').sort((a,b)=>(a.turnOrder??999)-(b.turnOrder??999)), [members]);
  const teamB = useMemo(() => members.filter(m => m.team === 'B').sort((a,b)=>(a.turnOrder??999)-(b.turnOrder??999)), [members]);

  const takenRoleMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of members) {
      if (m.role?.id) map.set(m.role.id, m);
    }
    return map;
  }, [members]);

  // Action
  const handleSelectRole = async (roleId: string) => {
    if (!roomId || isPickingBusy) return;
    setIsPickingBusy(true);

    try {
      const roleData = (ROLES as any[]).find(r => r.id === roleId);
      if (!roleData) return;

      await runTransaction(db, async (tx) => {
        const roomRef = doc(db, "rooms", roomId);
        const snap = await tx.get(roomRef);
        if (!snap.exists()) return;

        const data: any = snap.data();
        const mems = data.members || [];
        const order = data.draftOrder || [];
        const pickIndex = data.currentPickIndex ?? 0;
        const pickerId = order[pickIndex];

        const ok = pickerId === userId || isHost;
        if (!ok) return;

        const already = mems.some((m: any) => m.role?.id === roleId);
        if (already) return;

        const newMembers = mems.map((m: any) => {
          if (m.id === pickerId) {
            return { ...m, role: { ...roleData, skillUses: 2, ultUses: 1 } };
          }
          return m;
        });

        const nextIndex = pickIndex + 1;
        const finished = nextIndex >= order.length;

        tx.update(roomRef, {
          members: newMembers,
          currentPickIndex: nextIndex,
          status: finished ? 'playing' : 'drafting',
        });
      });
      setRoleModal(null);
    } finally {
      setIsPickingBusy(false);
    }
  };

  // --------------------
  // Render
  // --------------------

  return (
    <motion.div 
      variants={pageVariants} initial="hidden" animate="visible"
      className="w-full h-[100dvh] flex flex-col relative overflow-hidden text-white bg-black font-sans selection:bg-cyan-500/30 transition-colors duration-1000"
    >
       
      {/* Background Effect (Lobby Style) */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20" />
        {/* Team Mode Ambient: Orange/Red vs Purple/Cyan */}
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-purple-900/30 blur-[120px] rounded-full mix-blend-screen animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-red-900/30 blur-[120px] rounded-full mix-blend-screen animate-pulse delay-1000" />
      </div>

      {/* --- HEADER --- */}
      <header className="flex-none relative z-20 w-full bg-black/40 backdrop-blur-md border-b border-white/10 px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
            {/* Title Section */}
            <div>
                <GlitchText 
                    text="ROLE DRAFT" 
                    className="text-xl md:text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-white drop-shadow-[0_0_15px_rgba(34,211,238,0.3)]" 
                />
                
                {/* SYSTEM ONLINE */}
                <div className="flex items-center gap-2 mt-1.5 relative z-10">
                    <span className="text-[10px] font-mono text-cyan-300/80 tracking-widest bg-cyan-950/50 border border-cyan-500/20 px-1.5 py-0.5 rounded-sm">
                        PHASE: SELECTION
                    </span>
                </div>
            </div>

            {/* Turn Info */}
            <div className="flex flex-col items-end">
                 <div className="flex items-center gap-2">
                    <span className="hidden md:inline text-[10px] font-mono text-white/50 tracking-widest">STATUS</span>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border transition-all duration-300 ${canPick ? 'bg-cyan-500/20 border-cyan-400 text-cyan-100 shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 'bg-white/5 border-white/10 text-white/50'}`}>
                        {canPick && <span className="animate-pulse text-[10px] mr-1">●</span>}
                        <span className="text-xs md:text-sm font-bold tracking-wider">
                            {canPick ? (currentPickerId === userId ? "YOUR TURN" : "PROXY OVERRIDE") : `${currentPickerMember?.name || 'WAITING'}...`}
                        </span>
                    </div>
                 </div>
                 <div className="text-[10px] font-mono text-white/30 mt-1">
                    SEQUENCE {Math.min(currentPickIndex + 1, draftOrder.length)} / {draftOrder.length}
                 </div>
            </div>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 relative z-10 w-full max-w-7xl mx-auto p-4 md:p-6 overflow-hidden flex flex-col md:flex-row gap-4 md:gap-6">
        
        {/* TEAM A (Left Sidebar - Cyan) */}
        <aside className="hidden md:flex flex-col w-64 bg-cyan-950/20 backdrop-blur-sm border border-cyan-500/20 rounded-2xl p-4 overflow-y-auto custom-scrollbar shadow-lg">
            <TeamHeader team="A" />
            <div className="mt-4 space-y-2">
                {teamA.map(m => <PlayerCard key={m.id} member={m} currentPickerId={currentPickerId} />)}
            </div>
        </aside>

        {/* ROLES GRID (Center) */}
        <section className="flex-1 h-full min-h-0 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-2 md:p-6 overflow-y-auto custom-scrollbar shadow-inner relative">
            {/* Mobile: View Teams Button */}
            <div className="mb-4 flex items-center justify-between md:hidden">
                <span className="text-xs font-bold text-white/60 tracking-widest">AVAILABLE DATA</span>
                <button 
                    onClick={() => setShowMobileTeams(true)}
                    className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded text-[10px] font-bold tracking-widest text-cyan-300 active:scale-95 transition-transform shadow-[0_0_10px_rgba(34,211,238,0.1)]"
                >
                    VIEW ROSTER
                </button>
            </div>

            {/* Animation Container */}
            <motion.div 
                variants={cardContainerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-20 md:pb-0"
            >
                {(ROLES as any[]).map((role) => {
                    const takenBy = takenRoleMap.get(role.id);
                    return (
                        <RoleCard 
                            key={role.id} 
                            role={role} 
                            takenBy={takenBy} 
                            canPick={canPick && !takenBy} 
                            onClick={() => setRoleModal(role)} 
                        />
                    );
                })}
            </motion.div>
        </section>

        {/* TEAM B (Right Sidebar - Red) */}
        <aside className="hidden md:flex flex-col w-64 bg-red-950/20 backdrop-blur-sm border border-red-500/20 rounded-2xl p-4 overflow-y-auto custom-scrollbar shadow-lg">
            <TeamHeader team="B" />
            <div className="mt-4 space-y-2">
                {teamB.map(m => <PlayerCard key={m.id} member={m} currentPickerId={currentPickerId} />)}
            </div>
        </aside>
      </main>

      {/* --- MOBILE FOOTER --- */}
      <div className="md:hidden absolute bottom-0 left-0 right-0 z-30 bg-slate-900/90 backdrop-blur-xl border-t border-white/10 pb-safe">
        <div className="px-4 py-2">
            <div className="text-[9px] font-mono text-white/40 mb-1 tracking-widest">DRAFT QUEUE</div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                {draftOrder.map((id, idx) => {
                    const m = members.find(mem => mem.id === id);
                    if (!m) return null;
                    const isActive = m.id === currentPickerId;
                    const isDone = idx < currentPickIndex;
                    const borderColor = m.team === 'A' ? (isActive ? 'border-cyan-400 shadow-[0_0_10px_cyan]' : 'border-cyan-500/30') : (isActive ? 'border-red-400 shadow-[0_0_10px_red]' : 'border-red-500/30');
                    const activeText = m.team === 'A' ? 'text-cyan-300' : 'text-red-300';
                    
                    return (
                        <div key={`${id}-${idx}`} className={`flex-none flex flex-col items-center w-14 transition-all ${isActive ? 'scale-110 opacity-100' : isDone ? 'opacity-30 grayscale' : 'opacity-60'}`}>
                            <div className={`relative w-10 h-10 rounded-full flex items-center justify-center border-2 bg-black overflow-hidden ${borderColor}`}>
                                {m.avatar}
                                {m.role && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px]">✓</div>}
                            </div>
                            <div className={`text-[9px] mt-1 font-bold truncate w-full text-center ${isActive ? activeText : 'text-white'}`}>{m.name}</div>
                        </div>
                    )
                })}
            </div>
        </div>
      </div>

      {/* --- MODALS --- */}
      
      {/* Mobile Team Viewer */}
      <AnimatePresence>
        {showMobileTeams && (
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col p-4 pt-10"
            >
                <button onClick={() => setShowMobileTeams(false)} className="absolute top-4 right-4 text-white/50 p-2 text-2xl">&times;</button>
                <h2 className="text-xl font-black italic text-center mb-6 text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-red-300">DEPLOYMENT STATUS</h2>
                <div className="flex-1 overflow-y-auto space-y-6">
                    <div>
                        <TeamHeader team="A" />
                        <div className="mt-3 grid grid-cols-1 gap-2">
                            {teamA.map(m => <PlayerCard key={m.id} member={m} currentPickerId={currentPickerId} />)}
                        </div>
                    </div>
                    <div>
                        <TeamHeader team="B" />
                        <div className="mt-3 grid grid-cols-1 gap-2">
                            {teamB.map(m => <PlayerCard key={m.id} member={m} currentPickerId={currentPickerId} />)}
                        </div>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Role Detail Modal */}
      <AnimatePresence>
        {roleModal && (
          <RoleDetailModal 
            role={roleModal} 
            onClose={() => setRoleModal(null)} 
            onSelect={() => handleSelectRole(roleModal.id)}
            canPick={canPick}
            isTaken={!!takenRoleMap.get(roleModal.id)}
            isBusy={isPickingBusy}
          />
        )}
      </AnimatePresence>

      {/* ★★★ VS TRANSITION SCREEN (UPGRADED) ★★★ */}
      <AnimatePresence>
        {isTransitioning && (
          <MatchupTransition teamA={teamA} teamB={teamB} />
        )}
      </AnimatePresence>

    </motion.div>
  );
};

// --------------------
// Sub Components & Helpers
// --------------------

const GlitchText = ({ text, className }: { text: string, className?: string }) => (
    <div className={`relative ${className}`}>
        <span className="relative z-10">{text}</span>
        <span className="absolute top-0 left-0 translate-x-[-1px] translate-y-[1px] text-cyan-500/50 animate-pulse pointer-events-none z-0 mix-blend-lighten" style={{ clipPath: 'inset(0 0 40% 0)' }}>{text}</span>
        <span className="absolute top-0 left-0 translate-x-[1px] translate-y-[-1px] text-red-500/50 animate-pulse delay-75 pointer-events-none z-0 mix-blend-lighten" style={{ clipPath: 'inset(60% 0 0 0)' }}>{text}</span>
    </div>
);

const HighlightedText = ({ text }: { text: string }) => {
  const parts = text.split(/([+＋]\d+(?:,\d+)*)|([-−▼]\d+(?:,\d+)*)|(\d+(?:,\d+)*[%％倍])|(×\s?\d+)|(【.*?】)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.match(/^[+＋]/)) return <span key={i} className="text-cyan-400 font-black text-sm mx-0.5 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">{part}</span>;
        if (part.match(/^[-−▼]/)) return <span key={i} className="text-rose-400 font-black text-sm mx-0.5 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]">{part}</span>;
        if (part.match(/[%％倍]|×/)) return <span key={i} className="text-yellow-400 font-black text-sm mx-0.5 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]">{part}</span>;
        if (part.match(/^【.*】$/)) return <span key={i} className="text-white font-bold tracking-wider mr-1">{part}</span>;
        return <span key={i} className="text-white/80">{part}</span>;
      })}
    </span>
  );
};

const TeamHeader = ({ team }: { team: 'A' | 'B' }) => (
    <div className={`flex items-center justify-between border-b ${team === 'A' ? 'border-cyan-500/30' : 'border-red-500/30'} pb-2`}>
        <span className={`text-2xl font-black italic tracking-tighter ${team === 'A' ? 'text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]' : 'text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]'}`}>
            TEAM {team}
        </span>
        <span className="text-[10px] font-mono text-white/30">MEMBERS</span>
    </div>
);

const PlayerCard = ({ member, currentPickerId }: any) => {
    const picked = !!member.role;
    const isTurn = member.id === currentPickerId;
    const isTeamA = member.team === 'A';
    // チームに応じた色設定
    const borderColor = isTeamA ? 'group-hover:border-cyan-500/50' : 'group-hover:border-red-500/50';
    const activeBorder = isTeamA ? 'border-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'border-red-400/50 shadow-[0_0_15px_rgba(248,113,113,0.1)]';
    const activeBg = isTeamA ? 'bg-cyan-950/40' : 'bg-red-950/40';
    
    return (
        <div className={`group relative flex items-center gap-3 p-2.5 rounded-xl border transition-all duration-300
            ${isTurn ? `${activeBg} ${activeBorder}` : `bg-black/40 border-white/5 ${borderColor}`}
        `}>
            <div className="relative">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-xl shadow-inner overflow-hidden">
                    {member.avatar}
                </div>
                {isTurn && <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full animate-bounce shadow-lg ${isTeamA ? 'bg-cyan-400' : 'bg-red-400'}`} />}
            </div>
            <div className="flex-1 min-w-0">
                <div className={`text-sm font-bold truncate ${isTurn ? 'text-white' : 'text-white/70'}`}>{member.name}</div>
                <div className="text-[10px] font-mono text-white/40 truncate flex items-center gap-1">
                    {picked ? (
                        <>
                            <span className={isTeamA ? 'text-cyan-300' : 'text-red-300'}>{member.role.name}</span>
                        </>
                    ) : (
                        'WAITING...'
                    )}
                </div>
            </div>
        </div>
    );
};

const RoleCard = ({ role, takenBy, canPick, onClick }: any) => {
    const isTaken = !!takenBy;
    return (
        <motion.button
            variants={cardVariants}
            whileHover={!isTaken ? { scale: 1.02, y: -2 } : {}}
            whileTap={!isTaken ? { scale: 0.98 } : {}}
            onClick={onClick}
            className={`relative w-full text-left p-4 rounded-xl border transition-all duration-300 overflow-hidden flex flex-col h-full group
                ${isTaken 
                    ? 'bg-black/20 border-white/5 opacity-50 grayscale' 
                    : `bg-gradient-to-br ${role.tone} border-white/10 hover:border-white/40 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]`
                }
            `}
        >
            {/* Background Glitch Line */}
            {!isTaken && <div className="absolute top-0 left-0 w-full h-[1px] bg-white/30 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />}

            <div className="flex items-start justify-between w-full mb-3 relative z-10">
                <div className="w-10 h-10 rounded-lg bg-black/30 backdrop-blur-md flex items-center justify-center text-xl border border-white/10 shadow-lg">
                    {role.sigil}
                </div>
                <div className={`text-[9px] px-2 py-0.5 rounded border font-mono ${isTaken ? 'border-white/10 text-white/30' : 'border-cyan-400/30 text-cyan-200 bg-cyan-500/10'}`}>
                    {role.type}
                </div>
            </div>
            
            <div className="mb-auto relative z-10">
                <h3 className="text-lg font-black italic leading-none tracking-tight mb-1">{role.name}</h3>
                <p className="text-[10px] text-white/50 line-clamp-2 leading-relaxed">{role.desc}</p>
            </div>

            {isTaken ? (
                <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 relative z-10">
                    <div className="text-xs text-white/40">PICKED:</div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs">{takenBy.avatar}</span>
                        <span className="text-[10px] font-bold truncate max-w-[80px]">{takenBy.name}</span>
                    </div>
                </div>
            ) : (
                <div className={`mt-3 text-[10px] font-mono text-right relative z-10 ${canPick ? 'text-cyan-300 animate-pulse' : 'text-white/20'}`}>
                    {canPick ? 'TAP TO SELECT >' : 'AVAILABLE'}
                </div>
            )}
        </motion.button>
    );
};

const RoleDetailModal = ({ role, onClose, onSelect, canPick, isTaken, isBusy }: any) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-lg"
                onClick={onClose}
            />
            <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-lg bg-slate-900 border border-white/20 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
                {/* Header Graphic */}
                <div className={`h-32 bg-gradient-to-br ${role.tone} relative flex items-center px-6 overflow-hidden`}>
                    <div className="absolute top-0 right-0 p-4 opacity-10 font-black text-9xl italic leading-none select-none pointer-events-none transform rotate-12 translate-x-10 -translate-y-4">
                        {role.type}
                    </div>
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-black/40 backdrop-blur border border-white/20 flex items-center justify-center text-4xl shadow-xl">
                            {role.sigil}
                        </div>
                        <div>
                            <h2 className="text-3xl font-black italic tracking-tighter text-white drop-shadow-md">{role.name}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="px-2 py-0.5 rounded bg-black/30 border border-white/10 text-[10px] font-mono tracking-widest text-cyan-200">
                                    TYPE: {role.type}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/20 flex items-center justify-center hover:bg-white/10 text-white/50 hover:text-white transition-colors z-20">
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-slate-950/50">
                    <p className="text-sm text-white/80 italic mb-6 leading-relaxed border-l-2 border-cyan-500/50 pl-3">
                        "{role.desc}"
                    </p>

                    <div className="space-y-4">
                        <SkillRow label="PASSIVE" desc={role.passive} color="text-yellow-200" />
                        <SkillRow label="SKILL (2x)" desc={role.skill} color="text-cyan-200" />
                        <SkillRow label="ULTIMATE (1x)" desc={role.ult} color="text-pink-300" />
                    </div>
                </div>

                {/* Footer Action */}
                <div className="p-4 border-t border-white/10 bg-black/40 backdrop-blur">
                    <button
                        onClick={onSelect}
                        disabled={!canPick || isTaken || isBusy}
                        className={`w-full py-3.5 rounded-xl font-black text-sm tracking-[0.2em] transition-all flex items-center justify-center gap-2
                            ${isTaken 
                                ? 'bg-white/5 text-white/20 cursor-not-allowed' 
                                : (!canPick 
                                    ? 'bg-white/10 text-white/40 cursor-not-allowed' 
                                    : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] shadow-lg'
                                )
                            }
                        `}
                    >
                        {isBusy ? (
                            <span className="animate-pulse">PROCESSING...</span>
                        ) : isTaken ? (
                            "ALREADY TAKEN"
                        ) : canPick ? (
                            <>CONFIRM SELECTION <span className="text-lg">→</span></>
                        ) : (
                            "NOT YOUR TURN"
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const SkillRow = ({ label, desc, color }: any) => (
    <div className="bg-white/5 rounded-xl p-3 border border-white/5 hover:bg-white/10 transition-colors">
        <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono tracking-widest text-white/40">{label}</span>
            <span className={`text-[10px] font-bold ${color}`}>●</span>
        </div>
        <div className="text-xs leading-relaxed font-medium">
            <HighlightedText text={desc} />
        </div>
    </div>
);

// ★★★ VS TRANSITION SCREEN (UPGRADED) ★★★
// 中央で分割されたVS画面から、次画面へ繋がるトランジション
const MatchupTransition = ({ teamA, teamB }: { teamA: any[], teamB: any[] }) => {
    const introDelay = 0.5;
    const step = 0.8; // 一人あたりの表示時間
    const teamBDelay = introDelay + (teamA.length * step) + 0.5; 

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black flex flex-col md:flex-row overflow-hidden font-sans"
    >
        {/* Background Animation */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30 mix-blend-overlay" />
        
        {/* Split Line */}
        <motion.div 
            initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.5, ease: "circOut" }}
            className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-white z-0 hidden md:block" 
        />
        
        {/* CENTER VS TEXT */}
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <motion.div 
                initial={{ scale: 5, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                transition={{ delay: 0.2, type: "spring", bounce: 0.5 }}
                className="text-8xl md:text-9xl font-black italic tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.8)]"
            >
                VS
            </motion.div>
        </div>

        {/* TEAM A SIDE (Left - Cyan) */}
        <div className="flex-1 relative flex flex-col justify-center items-center py-10 bg-gradient-to-br from-cyan-900/60 to-black border-b md:border-b-0 md:border-r border-cyan-500/30">
            <motion.div 
                initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                className="absolute top-10 left-0 right-0 text-center z-10"
            >
                <h2 className="text-4xl md:text-6xl font-black italic text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.8)]">TEAM A</h2>
            </motion.div>
            
            <div className="flex flex-col gap-4 z-10 w-full max-w-md px-6 mt-16">
                {teamA.map((m, i) => (
                    <motion.div 
                        key={m.id}
                        initial={{ x: -100, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: introDelay + (i * step), type: "spring", stiffness: 100 }}
                        className="relative bg-black/60 border border-cyan-500/50 p-3 rounded-xl flex items-center justify-between backdrop-blur-md overflow-hidden shadow-[0_0_15px_rgba(34,211,238,0.2)]"
                    >
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="text-3xl">{m.avatar}</div>
                            <div>
                                <div className="font-bold text-white text-lg">{m.name}</div>
                                <div className="text-xs font-mono text-cyan-300">{m.role?.name || '???'}</div>
                            </div>
                        </div>
                        {/* ICON POP EFFECT */}
                        <motion.div 
                            initial={{ scale: 0, opacity: 0, rotate: -45 }}
                            animate={{ scale: 1, opacity: 0.3, rotate: 0 }}
                            transition={{ delay: introDelay + (i * step) + 0.2, type: "spring", bounce: 0.6 }}
                            className="absolute right-[-10px] top-[-10px] text-6xl text-cyan-400 font-bold"
                        >
                            {m.role?.sigil}
                        </motion.div>
                        <motion.div 
                            initial={{ scale: 2, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: introDelay + (i * step) + 0.1, type: "spring" }}
                            className="relative z-10 text-4xl text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]"
                        >
                            {m.role?.sigil}
                        </motion.div>
                    </motion.div>
                ))}
            </div>
        </div>

        {/* TEAM B SIDE (Right - Red) */}
        <div className="flex-1 relative flex flex-col justify-center items-center py-10 bg-gradient-to-tl from-red-900/60 to-black">
             <motion.div 
                initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                className="absolute bottom-10 md:bottom-auto md:top-10 left-0 right-0 text-center z-10"
            >
                <h2 className="text-4xl md:text-6xl font-black italic text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)]">TEAM B</h2>
            </motion.div>

            <div className="flex flex-col gap-4 z-10 w-full max-w-md px-6 mb-16 md:mt-16 md:mb-0">
                {teamB.map((m, i) => (
                    <motion.div 
                        key={m.id}
                        initial={{ x: 100, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: teamBDelay + (i * step), type: "spring", stiffness: 100 }}
                        className="relative bg-black/60 border border-red-500/50 p-3 rounded-xl flex flex-row-reverse items-center justify-between backdrop-blur-md text-right overflow-hidden shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                    >
                        <div className="flex flex-row-reverse items-center gap-4 relative z-10">
                            <div className="text-3xl">{m.avatar}</div>
                            <div>
                                <div className="font-bold text-white text-lg">{m.name}</div>
                                <div className="text-xs font-mono text-red-300">{m.role?.name || '???'}</div>
                            </div>
                        </div>
                        {/* ICON POP EFFECT */}
                        <motion.div 
                            initial={{ scale: 0, opacity: 0, rotate: 45 }}
                            animate={{ scale: 1, opacity: 0.3, rotate: 0 }}
                            transition={{ delay: teamBDelay + (i * step) + 0.2, type: "spring", bounce: 0.6 }}
                            className="absolute left-[-10px] top-[-10px] text-6xl text-red-400 font-bold"
                        >
                            {m.role?.sigil}
                        </motion.div>
                          <motion.div 
                            initial={{ scale: 2, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: teamBDelay + (i * step) + 0.1, type: "spring" }}
                            className="relative z-10 text-4xl text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.8)]"
                        >
                            {m.role?.sigil}
                        </motion.div>
                    </motion.div>
                ))}
            </div>
        </div>

        {/* FINAL FLASH & FADE OUT */}
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 1] }}
            transition={{ delay: teamBDelay + (teamB.length * step) + 1.0, duration: 1.5 }}
            className="absolute inset-0 z-50 bg-black flex items-center justify-center"
        >
             <motion.h1 
                initial={{ scale: 2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, type: 'spring' }}
                className="text-5xl md:text-8xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-red-500 tracking-widest drop-shadow-[0_0_50px_rgba(255,255,255,0.5)] text-center"
             >
                MISSION START
             </motion.h1>
        </motion.div>
    </motion.div>
  );
};