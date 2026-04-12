import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Table, Button, Tag, Space, message, Modal, Spin } from 'antd';
import { PlusOutlined, LogoutOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { adminGetEvents, adminToggleEvent, adminDeleteEvent, adminLogout, adminCheck, type AdminEventRow } from '../../api';

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<AdminEventRow[]>([]);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    adminGetEvents()
      .then((res) => setEvents(res.data))
      .catch((err: Error) => {
        if (err.message === '未登录') navigate('/admin/login');
        else message.error(err.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    adminCheck().catch(() => navigate('/admin/login'));
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async (date: string) => {
    try {
      await adminToggleEvent(date);
      load();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleDelete = (date: string) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除 ${date} 的活动吗？此操作不可恢复。`,
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        try {
          await adminDeleteEvent(date);
          message.success('已删除');
          load();
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const handleLogout = async () => {
    try {
      await adminLogout();
    } finally {
      navigate('/admin/login');
    }
  };

  const columns = [
    {
      title: '日期',
      dataIndex: 'eventDate',
      key: 'eventDate',
      render: (date: string) => <Link to={`/admin/events/${date}`}>{date}</Link>,
    },
    {
      title: '状态',
      dataIndex: 'open',
      key: 'open',
      render: (open: boolean) => open ? <Tag color="green">开放</Tag> : <Tag color="red">关闭</Tag>,
    },
    { title: '队伍数', dataIndex: 'teamCount', key: 'teamCount' },
    {
      title: '报名',
      key: 'reg',
      render: (_: unknown, record: AdminEventRow) => `${record.registeredCount}/${record.teamCount * 4}`,
    },
    { title: '候补', dataIndex: 'waitlistCount', key: 'waitlistCount' },
    {
      title: '时间',
      key: 'time',
      render: (_: unknown, record: AdminEventRow) => record.startTime ? `${record.startTime}${record.endTime ? ' - ' + record.endTime : ''}` : '-',
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: AdminEventRow) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/admin/events/${record.eventDate}`)}>详情</Button>
          <Button size="small" onClick={() => navigate(`/admin/events/${record.eventDate}/edit`)}>编辑</Button>
          <Button size="small" onClick={() => handleToggle(record.eventDate)}>
            {record.open ? '关闭' : '开放'}
          </Button>
          <Button size="small" danger onClick={() => handleDelete(record.eventDate)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-wrap">
      <div className="page-inner page-inner--wide">
        <div className="page-header">
          <div className="page-title page-title--lg">管理后台</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button icon={<TeamOutlined />} onClick={() => navigate('/')}>前台</Button>
            <Button icon={<UserOutlined />} onClick={() => navigate('/admin/users')}>账号管理</Button>
            <Button icon={<PlusOutlined />} type="primary" onClick={() => navigate('/admin/events/new')}>新建活动</Button>
            <Button icon={<LogoutOutlined />} onClick={handleLogout}>登出</Button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
        ) : (
          <div className="g-card">
            <Table
              dataSource={events}
              columns={columns}
              rowKey="eventDate"
              pagination={{ pageSize: 20 }}
              size="small"
              scroll={{ x: 700 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

