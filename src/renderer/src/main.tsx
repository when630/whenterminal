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
// 명조(설정 FONT의 SERIF, zen 질문). 한글은 unicode-range 조각이라 쓰인 글자 조각만 불러온다
import '@fontsource/noto-serif-kr/400.css'
import '@fontsource/noto-serif-kr/700.css'
// 손글씨(설정 FONT의 HANDWRITING, sketch 스킨의 질문·제목). 한글은 unicode-range 조각이라 쓰인 조각만 불러온다
import '@fontsource/gaegu/400.css'
import '@fontsource/gaegu/700.css'
import './styles.css'
// 스킨: :root[data-skin] 아래에서 styles.css를 덮는다. 스킨의 색 테마도 각 파일에
import './skins/soft.css'
import './skins/tui.css'
import './skins/zen.css'
import './skins/glass.css'
import './skins/ide.css'
import './skins/sketch.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
