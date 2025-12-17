// src/App.tsx
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';

// 画面コンポーネント
import { EntranceScreen } from './screens/EntranceScreen';
import { MenuScreen } from './screens/MenuScreen';
import { GameSetupScreen } from './screens/GameSetupScreen';
import { GamePlayScreen } from './screens/GamePlayScreen'; // ★追加
import { ResultScreen } from './screens/ResultScreen'; // まだ作ってないのでコメントアウトのまま

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<EntranceScreen />} />
        <Route path="/menu" element={<MenuScreen />} />
        <Route path="/game-setup" element={<GameSetupScreen />} />
        
        {/* ★ここを本物に書き換え */}
        <Route path="/game-play" element={<GamePlayScreen />} />
        <Route path="/result" element={<ResultScreen />} />
        
        {/* 仮置き */}
        <Route path="/topic-manage" element={<div className="text-2xl font-bold">TOPIC MANAGE (Coming Soon)</div>} />
        <Route path="/free-mode" element={<div className="text-2xl font-bold">FREE MODE (Coming Soon)</div>} />
        
      </Routes>
    </Layout>
  );
}

export default App;