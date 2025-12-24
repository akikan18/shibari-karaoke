// src/App.tsx
import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';

// ★重要: レイアウトコンポーネントを復活
import { Layout } from './components/Layout';

import { EntranceScreen } from './screens/EntranceScreen';
import { MenuScreen } from './screens/MenuScreen';
import { GameSetupScreen } from './screens/GameSetupScreen';
import { GamePlayScreen } from './screens/GamePlayScreen';
import { ResultScreen } from './screens/ResultScreen';
// 新規追加した画面
import { CustomThemeScreen } from './screens/CustomThemeScreen';
import { FreeModeScreen } from './screens/FreeModeScreen.tsx';

import { TeamDraftScreen } from './screens/TeamDraftScreen.tsx';
import { GamePlayTeamScreen } from './screens/GamePlayTeamScreen.tsx';
import ResultTeamScreen from './screens/ResultTeamScreen';

function App() {
  const location = useLocation();

  return (
    // ★重要: ここで全体をLayoutで囲むことで、背景色などが適用されます
    <Layout>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          
          <Route path="/" element={<EntranceScreen />} />
          <Route path="/menu" element={<MenuScreen />} />
          
          {/* 追加機能 */}
          <Route path="/custom" element={<CustomThemeScreen />} />
          <Route path="/free" element={<FreeModeScreen />} />
          
          <Route path="/game-setup" element={<GameSetupScreen />} />
          <Route path="/game-play" element={<GamePlayScreen />} />
          <Route path="/result" element={<ResultScreen />} />

          {/* ルーティング互換性のためのリダイレクト（念の為） */}
          <Route path="/topic-manage" element={<CustomThemeScreen />} />
          <Route path="/free-mode" element={<FreeModeScreen />} />
          
          <Route path="/team-draft" element={<TeamDraftScreen />} />
          <Route path="/game-play-team" element={<GamePlayTeamScreen />} />

          <Route path="/team-result" element={<ResultTeamScreen />} />

        </Routes>
      </AnimatePresence>
    </Layout>
  );
}

export default App;