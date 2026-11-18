import { describe, it, expect } from 'vitest'
import { greeting, todoText, whenText } from './texts'

const fmt = (d: string) => d

describe('dashboard texts', () => {
  it('greets by the time of day', () => {
    expect(greeting(new Date(2026, 10, 18, 8))).toBe('Good morning')
    expect(greeting(new Date(2026, 10, 18, 14))).toBe('Good afternoon')
    expect(greeting(new Date(2026, 10, 18, 21))).toBe('Good evening')
    expect(greeting(new Date(2026, 10, 18, 2))).toBe('Good evening')
  })

  it('says when', () => {
    expect(whenText(0)).toBe('today')
    expect(whenText(1)).toBe('tomorrow')
    expect(whenText(17)).toBe('in 17 days')
  })

  it('turns to-dos into sentences with links that open the right place', () => {
    const base = { eventId: 3, eventName: 'Drückjagd', date: '2026-12-05' }
    expect(todoText({ ...base, code: 'documents_to_check', count: 4 }, fmt)).toMatchObject({ text: '4 documents to check', to: '/manager/events/3?tab=guests&open=check' })
    expect(todoText({ ...base, code: 'coming_without_licence', count: 1, names: ['Anna Gast'] }, fmt)).toMatchObject({
      text: '1 guest is coming without a checked, valid licence', detail: 'Drückjagd: Anna Gast', tone: 'red',
    })
    expect(todoText({ ...base, code: 'answer_deadline', count: 6, respondBy: '2026-11-21', daysLeft: 3 }, fmt).text).toBe('Answer-by date in 3 days: 6 guests have not answered')
    expect(todoText({ code: 'stands_damaged', areaId: 9, areaName: 'Bog', broken: 2, needsRepair: 1 }, fmt)).toMatchObject({
      text: '2 stands are broken, 1 needs repair', to: '/manager/areas/9', tone: 'red',
    })
  })
})
