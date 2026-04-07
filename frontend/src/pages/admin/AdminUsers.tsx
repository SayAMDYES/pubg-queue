import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Table, Button, Tag, Space, Input, message, Typography, Modal, Spin } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { adminGetUsers, adminDeleteUser, type AdminUserRow } from '../../api';

const { Title } = Typography;

export default function AdminUsers() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    adminGetUsers()
      .then((res) => setUsers(res.data))
      .catch((err: Error) => {
        if (err.message === '未登录') navigate('/admin/login');
        else message.error(err.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = (user: AdminUserRow) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除用户 ${user.phone} 吗？其活跃报名将被取消。`,
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        try {
          await adminDeleteUser(user.id);
          message.success('已删除');
          load();
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const filtered = users.filter((u) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return u.phone.includes(s) || u.gameNames.some((gn) => gn.toLowerCase().includes(s));
  });

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone: string, record: AdminUserRow) => <Link to={`/admin/users/${record.id}/edit`}>{phone}</Link>,
    },
    {
      title: '游戏名',
      dataIndex: 'gameNames',
      key: 'gameNames',
      render: (names: string[]) => names.map((n) => <Tag key={n}>{n}</Tag>),
    },
    { title: '报名次数', dataIndex: 'regCount', key: 'regCount' },
    { title: '注册时间', dataIndex: 'createdAt', key: 'createdAt' },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: AdminUserRow) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/admin/users/${record.id}/edit`)}>编辑</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px', background: '#0a0a0a', minHeight: '100vh' }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin')}>返回</Button>
      </Space>

      <Title level={3} style={{ color: '#f0a500' }}>👤 账号管理</Title>

      <Input
        prefix={<SearchOutlined />}
        placeholder="搜索手机号或游戏名"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 300, marginBottom: 16 }}
        allowClear
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : (
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          size="small"
        />
      )}
    </div>
  );
}
