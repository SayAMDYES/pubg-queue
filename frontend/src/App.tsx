import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import CalendarPage from './pages/CalendarPage';
import EventDetailPage from './pages/EventDetailPage';
import StatsPage from './pages/StatsPage';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminEventForm from './pages/admin/AdminEventForm';
import AdminEventDetail from './pages/admin/AdminEventDetail';
import AdminUsers from './pages/admin/AdminUsers';
import AdminUserEdit from './pages/admin/AdminUserEdit';

function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#f0a500',
          borderRadius: 8,
          colorBgContainer: '#1a1a2e',
          colorBgElevated: '#16213e',
          colorBgLayout: '#0a0a0a',
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/date/:date" element={<EventDetailPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/events/new" element={<AdminEventForm />} />
          <Route path="/admin/events/:date/edit" element={<AdminEventForm />} />
          <Route path="/admin/events/:date" element={<AdminEventDetail />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/users/:id/edit" element={<AdminUserEdit />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
