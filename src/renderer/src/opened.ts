import { useCallback, useState } from 'react'

/**
 * 지금 펼쳐 둔 기록 줄 (key). 줄이 다시 그려져도(활동 묶음이 줄 하나에서 묶음으로 바뀌면 부모가 바뀌어 새로 그린다)
 * 펼친 채로 돌아오게 한다. 접으면 지우므로 펼쳐 둔 줄만 남는다
 */
const OPEN = new Set<string>()

/**
 * 펼친 적 있는 details인지. 본문은 처음 펼칠 때 그리고 접어도 남긴다(접히는 움직임 동안 보이게).
 * 대화 기록의 접힌 본문(입력 JSON·diff·결과·Markdown) 수백 개를 미리 그리지 않아 화면이 가볍다.
 * key를 주면 펼침 상태를 기억해 다시 그려질 때 되살린다: 세 번째 값(initialOpen)을 details의 open으로 줄 것
 * (처음 값만 주므로 React가 그 뒤의 펼치고 접기를 덮지 않는다)
 */
export function useOpened(key?: string): [boolean, (e: React.SyntheticEvent<HTMLDetailsElement>) => void, boolean | undefined] {
  const [initialOpen] = useState(() => (key !== undefined && OPEN.has(key)) || undefined)
  const [opened, setOpened] = useState(!!initialOpen)
  const onToggle = useCallback(
    (e: React.SyntheticEvent<HTMLDetailsElement>) => {
      const open = e.currentTarget.open
      if (open) setOpened(true)
      if (key === undefined) return
      if (open) OPEN.add(key)
      else OPEN.delete(key)
    },
    [key],
  )
  return [opened, onToggle, initialOpen]
}
