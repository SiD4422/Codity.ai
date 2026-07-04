import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProjectProvider } from './api/ProjectContext';
import Shell from './components/Shell';
import LoginPage from './pages/LoginPage';
import QueuesPage from './pages/QueuesPage';
import QueueDetailPage from './pages/QueueDetailPage';
import WorkersPage from './pages/WorkersPage';

function RequireAuth({ children }) {
  const token = localStorage.getItem('jobscheduler_token');
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={
          <RequireAuth>
            <ProjectProvider><Shell /></ProjectProvider>
          </RequireAuth>
        }>
          <Route index element={<QueuesPage />} />
          <Route path="queues/:queueId" element={<QueueDetailPage />} />
          <Route path="workers" element={<WorkersPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
