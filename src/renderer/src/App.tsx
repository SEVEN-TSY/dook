import { TasksPage } from './features/tasks/TasksPage'

export function App() {
  const kind =
    new URLSearchParams(window.location.search).get('window') === 'note' ? 'note' : 'main'
  return <TasksPage kind={kind} />
}
