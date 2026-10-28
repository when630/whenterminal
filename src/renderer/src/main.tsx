import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './ErrorBoundary'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo/900.css'
import '@fontsource/black-han-sans/400.css'
import './styles.css'
// 스킨: :root[data-skin] 아래에서 styles.css를 덮는다. 스킨의 색 테마도 각 파일에
import './skins/soft.css'
import './skins/tui.css'
import './skins/zen.css'
import './skins/glass.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
