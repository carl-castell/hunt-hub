import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type EditMode = { editStands: boolean; setEditStands: (on: boolean) => void }

const EditModeContext = createContext<EditMode>({ editStands: false, setEditStands: () => {} })

/**
 * Whether stands can be created, moved and renamed. Kept in memory only, so it
 * is off by default and off again after the app restarts: changes in the field
 * are always a deliberate choice.
 */
export function EditModeProvider({ children }: { children: ReactNode }) {
  const [editStands, setEditStands] = useState(false)
  const value = useMemo(() => ({ editStands, setEditStands }), [editStands])
  return <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>
}

export const useEditMode = () => useContext(EditModeContext)
