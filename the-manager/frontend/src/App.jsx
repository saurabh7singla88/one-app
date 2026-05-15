import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import InitiativesList from './pages/InitiativesList';
import InitiativeDetail from './pages/InitiativeDetail';
import MindMap from './pages/MindMap';
import Tasks from './pages/Tasks';
import Users from './pages/Users';

import Notes from './pages/Notes';
import MeetingNotes from './pages/MeetingNotes';
import AINewsletter from './pages/AINewsletter';
import TeamBoard from './pages/TeamBoard';
import Setup from './pages/Setup';
import Help from './pages/Help';
import Layout from './components/Layout';

function App() {
  const { isAuthenticated } = useSelector((state) => state.auth);

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/" /> : <Register />} />
      
      <Route element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/initiatives" element={<InitiativesList />} />
        <Route path="/initiatives/:id" element={<InitiativeDetail />} />
        <Route path="/mindmap" element={<MindMap />} />
        <Route path="/tasks" element={<Tasks />} />

        <Route path="/notes" element={<Notes />} />
        <Route path="/meeting-notes" element={<MeetingNotes />} />
        <Route path="/ai-newsletter" element={<AINewsletter />} />
        <Route path="/team-board" element={<TeamBoard />} />
        <Route path="/users" element={<Users />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/help" element={<Help />} />
      </Route>
    </Routes>
  );
}

export default App;
