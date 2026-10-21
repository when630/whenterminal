import { useCallback, useState } from 'react'

/**
 * 펼친 적 있는 details인지. 본문은 처음 펼칠 때 그리고 접어도 남긴다(접히는 움직임 동안 보이게).
 * 대화 기록의 접힌 본문(입력 JSON·diff·결과·Markdown) 수백 개를 미리 그리지 않아 화면이 가볍다
 */
export function useOpened(): [boolean, (e: React.SyntheticEvent<HTMLDetailsElement>) => void] {
  const [opened, setOpened] = useState(false)
  const onToggle = useCallback((e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (e.currentTarget.open) setOpened(true)
  }, [])
  return [opened, onToggle]
}
