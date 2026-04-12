import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, Button, Tag, Table, message, Spin, Modal } from 'antd';
import { ArrowLeftOutlined, LockOutlined, DeleteOutlined, EditOutlined, CheckOutlined, CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { adminGetUser, adminUpdateUser, adminDeleteUser, adminResetPassword, adminAddGameName, adminUpdateGameName, adminDeleteGameName, type AdminUserDetail } from '../../api';
import { formatDateTime } from '../../utils';

const histStatusLabel: Record<string, string> = { assigned: '已分配', waitlist: '候补', cancelled: '已取消' };
const histStatusColor: Record<string, string> = { assigned: 'green', waitlist: 'orange', cancelled: 'red' };

export default function AdminUserEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [pwForm] = Form.useForm();
  const [addForm] = Form.useForm();
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingLoading, setEditingLoading] = useState(false);
  const [addingLoading, setAddingLoading] = useState(false);

  const uid = parseInt(id || '0', 10);

  const load = () => {
    if (!uid) return;
    setLoading(true);
    adminGetUser(uid)
      .then((res) => {
        setData(res.data);
        form.setFieldsValue({ phone: res.data.user.phone });
      })
      .catch((err: Error) => {
        if (err.message === '未登录') navigate('/admin/login');
        else message.error(err.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (gn: string) => {
    setEditingName(gn);
    setEditingValue(gn);
  };

  const confirmEdit = async (gn: string) => {
    const newName = editingValue.trim();
    if (!newName || newName === gn) {
      setEditingName(null);
      return;
    }
    setEditingLoading(true);
    try {
      await adminUpdateGameName(uid, gn, newName);
      message.success('重命名成功');
      setEditingName(null);
      load();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '重命名失败');
    } finally {
      setEditingLoading(false);
    }
  };

  const cancelEdit = () => { setEditingName(null); };

  const handleDeleteGameName = (gn: string) => {
    Modal.confirm({
      title: '确认删除游戏名',
      content: `确定删除游戏名「${gn}」吗？`,
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        try {
          await adminDeleteGameName(uid, gn);
          message.success('已删除');
          load();
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const handleAddGameName = async (values: { newGameName: string }) => {
    const name = values.newGameName?.trim();
    if (!name) return;
    setAddingLoading(true);
    try {
      await adminAddGameName(uid, name);
      message.success('游戏名已添加');
      addForm.resetFields();
      load();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setAddingLoading(false);
    }
  };

  const handleUpdatePhone = async (values: { phone: string }) => {
    setSubmitting(true);
    try {
      await adminUpdateUser(uid, { phone: values.phone });
      message.success('手机号已更新');
      load();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (values: { newPassword: string }) => {
    try {
      await adminResetPassword(uid, values.newPassword);
      message.success('密码已重置');
      pwForm.resetFields();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '重置失败');
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: '确认删除用户',
      content: '删除后其活跃报名将被取消，此操作不可恢复。',
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        try {
          await adminDeleteUser(uid);
          message.success('已删除');
          navigate('/admin/users');
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  if (loading || !data) {
    return <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>;
  }

  const { user, regHistory } = data;

  const histColumns = [
    { title: '活动日期', dataIndex: 'eventDate', key: 'eventDate' },
    { title: '游戏名', dataIndex: 'name', key: 'name' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag color={histStatusColor[s] || 'default'}>{histStatusLabel[s] || s}</Tag>,
    },
    { title: '报名时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => formatDateTime(v) },
  ];

  return (
    <div className="page-wrap">
      <div className="page-inner" style={{ maxWidth: 800 }}>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/users')}>返回</Button>
            <div className="page-title page-title--lg">编辑用户</div>
          </div>
        </div>

        <div className="g-card" style={{ marginBottom: 4 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>注册时间：{formatDateTime(user.createdAt)}</span>
        </div>

        {/* Basic info */}
        <div className="g-card" style={{ marginBottom: 16 }}>
          <div className="section-label" style={{ marginBottom: 16 }}>基本信息</div>

          {/* Phone */}
          <Form form={form} onFinish={handleUpdatePhone} layout="vertical">
            <Form.Item name="phone" label="手机号" rules={[{ required: true, pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }]}>
              <Input maxLength={11} />
            </Form.Item>
            <Form.Item style={{ marginBottom: 16 }}>
              <Button type="primary" htmlType="submit" loading={submitting}>保存手机号</Button>
            </Form.Item>
          </Form>

          {/* Game names */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ fontWeight: 500, marginBottom: 10, fontSize: 14 }}>游戏名</div>
            {user.gameNames.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {user.gameNames.map((gn) => {
                  const isEditing = editingName === gn;
                  return (
                    <div key={gn} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isEditing ? (
                        <>
                          <Input
                            size="small"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onPressEnter={() => confirmEdit(gn)}
                            style={{ width: 160 }}
                            maxLength={20}
                            autoFocus
                          />
                          <Button size="small" icon={<CheckOutlined />} type="primary" loading={editingLoading} onClick={() => confirmEdit(gn)} />
                          <Button size="small" icon={<CloseOutlined />} onClick={cancelEdit} />
                        </>
                      ) : (
                        <>
                          <Tag>{gn}</Tag>
                          <Button
                            size="small"
                            icon={<EditOutlined />}
                            type="text"
                            onClick={() => startEdit(gn)}
                            style={{ padding: '0 4px' }}
                          />
                          <Button
                            size="small"
                            icon={<DeleteOutlined />}
                            type="text"
                            danger
                            onClick={() => handleDeleteGameName(gn)}
                            style={{ padding: '0 4px' }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {user.gameNames.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>暂无游戏名</div>
            )}

            {/* Add new game name */}
            <Form form={addForm} onFinish={handleAddGameName} layout="inline">
              <Form.Item
                name="newGameName"
                rules={[
                  { required: true, message: '请输入游戏名' },
                  { pattern: /^[\w\u4e00-\u9fff\u3400-\u4dbf ]{1,20}$/, message: '游戏名仅限中英文、数字、下划线、空格，最长20字符' },
                ]}
              >
                <Input placeholder="新增游戏名" maxLength={20} style={{ width: 180 }} />
              </Form.Item>
              <Form.Item>
                <Button type="default" htmlType="submit" icon={<PlusOutlined />} loading={addingLoading}>添加</Button>
              </Form.Item>
            </Form>
          </div>
        </div>

        {/* Reset password */}
        <div className="g-card" style={{ marginBottom: 16 }}>
          <div className="section-label" style={{ marginBottom: 16 }}>
            <LockOutlined style={{ marginRight: 6 }} />重置密码
          </div>
          <Form form={pwForm} onFinish={handleResetPassword} layout="inline">
            <Form.Item name="newPassword" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
              <Input.Password placeholder="新密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">重置密码</Button>
            </Form.Item>
          </Form>
        </div>

        {/* Registration history */}
        {regHistory.length > 0 && (
          <div className="g-card" style={{ marginBottom: 16 }}>
            <div className="section-label" style={{ marginBottom: 12 }}>报名历史</div>
            <Table
              dataSource={regHistory}
              columns={histColumns}
              pagination={false}
              size="small"
              rowKey={(_, idx) => String(idx)}
            />
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 8 }}>
          <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>删除此用户</Button>
        </div>
      </div>
    </div>
  );
}
