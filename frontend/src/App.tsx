import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import CalendarPage from './pages/CalendarPage';
import EventDetailPage from './pages/EventDetailPage';
import StatsPage from './pages/StatsPage';
import UserLoginPage from './pages/UserLoginPage';
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
          colorBgContainer: '#0d0d1c',
          colorBgElevated: '#131328',
          colorBgLayout: '#060610',
          colorBorder: 'rgba(240, 165, 0, 0.15)',
          colorBorderSecondary: 'rgba(240, 165, 0, 0.08)',
          colorText: '#dde1e9',
          colorTextSecondary: '#7a8494',
          colorTextTertiary: '#454e5e',
          borderRadius: 6,
          fontFamily: "'Chakra Petch', -apple-system, sans-serif",
          fontSize: 13,
        },
        components: {
          Table: {
            colorBgContainer: '#0d0d1c',
            headerBg: '#131328',
            borderColor: 'rgba(240, 165, 0, 0.08)',
            rowHoverBg: '#191932',
          },
          Card: {
            colorBgContainer: '#0d0d1c',
            colorBorderSecondary: 'rgba(240, 165, 0, 0.15)',
            headerBg: '#131328',
          },
          Modal: {
            contentBg: '#0d0d1c',
            headerBg: '#131328',
          },
          Select: {
            colorBgContainer: '#131328',
            optionSelectedBg: 'rgba(240, 165, 0, 0.12)',
          },
          Input: {
            colorBgContainer: '#131328',
            hoverBorderColor: 'rgba(240, 165, 0, 0.5)',
            activeBorderColor: '#f0a500',
          },
          DatePicker: {
            colorBgContainer: '#131328',
          },
          Descriptions: {
            colorBgContainer: 'transparent',
            labelBg: 'transparent',
          },
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/date/:date" element={<EventDetailPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/login" element={<UserLoginPage />} />
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
