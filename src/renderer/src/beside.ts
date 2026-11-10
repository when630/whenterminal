import { createContext, useContext } from 'react'

/** 펼친 화면이 대화 기록 옆 칸에 있는지 (Chat이 넓을 때). 기록이 보이므로 닫기 버튼은 '대화로 돌아가기'가 아니라 CLOSE */
export const BesideContext = createContext(false)

export const useBackLabel = (): string => (useContext(BesideContext) ? 'CLOSE' : 'BACK TO CHAT')
