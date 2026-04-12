import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, Button, Tag, Table, message, Spin, Modal, Checkbox } from 'antd';
import { ArrowLeftOutlined, LockOutlined, DeleteOutlined, EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { adminGetUser, adminUpdateUser, adminDeleteUser, adminResetPassword, type AdminUserDetail } from '../../api';
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
  const [deleteGameNames, setDeleteGameNames] = useState<string[]>([]);
  // renameGameNames: map of old name → new name (pending renames)
  const [renameGameNames, setRenameGameNames] = useState<Record<string, string>>({});
  // editingName: which game name is currently being inline-edited
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const uid = parseInt(id || '0', 10);

  const load = () => {
    if (!uid) return;
    setLoading(true);
    adminGetUser(uid)
      .then((res) => {
        setData(res.data);
        form.setFieldsValue({ phone: res.data.user.phone });
        setRenameGameNames({});
        setDeleteGameNames([]);
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
    setEditingValue(renameGameNames[gn] ?? gn);
  };

  const confirmEdit = (gn: string) => {
    const newName = editingValue.trim();
    if (newName && newName !== gn) {
      setRenameGameNames((prev) => ({ ...prev, [gn]: newName }));
    } else if (!newName || newName === gn) {
      // cancel rename if same or empty
      setRenameGameNames((prev) => {
        const next = { ...prev };
        delete next[gn];
        return next;
      });
    }
    setEditingName(null);
  };

  const cancelEdit = () => { setEditingName(null); };

  const handleUpdate = async (values: { phone: string; newGameName?: string }) => {
    setSubmitting(true);
    try {
      const renames = Object.entries(renameGameNames).map(([old, newName]) => ({ old, new: newName }));
      await adminUpdateUser(uid, {
        phone: values.phone,
        deleteGameNames,
        newGameName: values.newGameName || '',
        renameGameNames: renames,
      });
      message.success('保存成功');
      setDeleteGameNames([]);
      setRenameGameNames({});
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
          <Form form={form} onFinish={handleUpdate} layout="vertical">
            <Form.Item name="phone" label="手机号" rules={[{ required: true, pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }]}>
              <Input maxLength={11} />
            </Form.Item>

            {user.gameNames.length > 0 && (
              <Form.Item label="历史游戏名">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {user.gameNames.map((gn) => {
                    const displayName = renameGameNames[gn] ?? gn;
                    const isEditing = editingName === gn;
                    return (
                      <div key={gn} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Checkbox
                          checked={deleteGameNames.includes(gn)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDeleteGameNames([...deleteGameNames, gn]);
                            } else {
                              setDeleteGameNames(deleteGameNames.filter((n) => n !== gn));
                            }
                          }}
                        />
                        {isEditing ? (
                          <>
                            <Input
                              size="small"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onPressEnter={() => confirmEdit(gn)}
                              style={{ width: 140 }}
                              maxLength={20}
                              autoFocus
                            />
                            <Button size="small" icon={<CheckOutlined />} type="primary" onClick={() => confirmEdit(gn)} />
                            <Button size="small" icon={<CloseOutlined />} onClick={cancelEdit} />
                          </>
                        ) : (
                          <>
                            <Tag color={deleteGameNames.includes(gn) ? 'red' : renameGameNames[gn] ? 'blue' : 'default'}>
                              {displayName}
                              {renameGameNames[gn] && <span style={{ color: 'var(--text-muted)', fontSize: 10 }}> (原: {gn})</span>}
                            </Tag>
                            {!deleteGameNames.includes(gn) && (
                              <Button
                                size="small"
                                icon={<EditOutlined />}
                                type="text"
                                onClick={() => startEdit(gn)}
                                style={{ padding: '0 4px' }}
                              />
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                {deleteGameNames.length > 0 && (
                  <div style={{ marginTop: 6, color: 'var(--danger)', fontSize: 12 }}>勾选的游戏名将在保存时删除</div>
                )}
                {Object.keys(renameGameNames).length > 0 && (
                  <div style={{ marginTop: 6, color: '#1677ff', fontSize: 12 }}>蓝色游戏名将在保存时重命名（同步更新历史报名记录）</div>
                )}
              </Form.Item>
            )}

            <Form.Item name="newGameName" label="新增游戏名">
              <Input placeholder="可选，新增一个游戏名" maxLength={20} />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" loading={submitting}>保存修改</Button>
            </Form.Item>
          </Form>
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

