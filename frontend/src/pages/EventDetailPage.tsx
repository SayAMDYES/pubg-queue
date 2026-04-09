import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Form, Input, Button, Select, message, Typography, Space, Spin, Alert, Tooltip, Result, Popconfirm } from 'antd';
import { CopyOutlined, ArrowLeftOutlined, UserAddOutlined, LogoutOutlined, UserOutlined, LoginOutlined } from '@ant-design/icons';
import { getEventDetail, registerEvent, leaveEvent, userLogout, type EventDetailData, type RegisterResult, type LeaveResult } from '../api';

const { Title, Text, Paragraph } = Typography;

export default function EventDetailPage() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EventDetailData | null>(null);
  const [regResult, setRegResult] = useState<RegisterResult | null>(null);
  const [leaveResult, setLeaveResult] = useState<LeaveResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [regForm] = Form.useForm();
  const [leaveForm] = Form.useForm();

  const load = () => {
    if (!date) return;
    setLoading(true);
    getEventDetail(date)
      .then((res) => {
        setData(res.data);
      })
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegister = async (values: { name: string }) => {
    if (!date) return;
    setSubmitting(true);
    try {
      const res = await registerEvent(date, { name: values.name });
      setRegResult(res.data);
      message.success('报名成功！');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '报名失败';
      const errorMap: Record<string, string> = {
        not_logged_in: '请先登录后再报名',
        invalid_name: '游戏名格式不正确（1-20字符）',
        event_closed: '报名已关闭',
        phone_already_registered: '该手机号已报名',
        name_already_registered: '该游戏名已被使用',
      };
      message.error(errorMap[errMsg] || errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeaveWithSession = async () => {
    if (!date) return;
    setSubmitting(true);
    try {
      const res = await leaveEvent(date);
      setLeaveResult(res.data);
      message.success('离队成功！');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '离队失败';
      message.error(errMsg === 'registration_not_found' ? '未找到您的报名记录' : errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeaveWithPassword = async (values: { phone: string; password: string }) => {
    if (!date) return;
    setSubmitting(true);
    try {
      const res = await leaveEvent(date, values);
      setLeaveResult(res.data);
      message.success('离队成功！');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '离队失败';
      const errorMap: Record<string, string> = {
        wrong_password: '密码错误',
        registration_not_found: '未找到您的报名记录',
      };
      message.error(errorMap[errMsg] || errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await userLogout();
      message.success('已退出登录');
      load();
    } catch {
      message.error('退出失败');
    }
  };

  const handleCopyInvite = () => {
    if (!data) return;
    const ev = data.event;
    const text = `🐔 PUBG 开黑召集令！
📅 日期：${ev.eventDate}${ev.startTime ? `\n⏰ 时间：${ev.startTime}` : ''}
👥 已报名：${data.registeredCount}/${data.capacity}
${ev.note ? `📝 ${ev.note}\n` : ''}
🔗 立即报名：${window.location.href}`;
    navigator.clipboard.writeText(text).then(() => message.success('邀请文案已复制！'));
  };

  if (regResult) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px', minHeight: '100vh', background: '#0a0a0a' }}>
        <Result
          status="success"
          title="报名成功！"
          subTitle={`${regResult.name}（${regResult.maskedPhone}）已${regResult.status === 'assigned' ? '分配到队伍' : '加入候补'}`}
          extra={[
            <Button key="back" type="primary" onClick={() => { setRegResult(null); load(); }}>返回活动</Button>,
            <Button key="home" onClick={() => navigate('/')}>返回首页</Button>,
          ]}
        />
      </div>
    );
  }

  if (leaveResult) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px', minHeight: '100vh', background: '#0a0a0a' }}>
        <Result
          status="success"
          title="离队成功！"
          subTitle={
            <>
              <p>{leaveResult.leftName} 已离队</p>
              {leaveResult.promotedName && <p>🎉 {leaveResult.promotedName} 已从候补递补入队！</p>}
            </>
          }
          extra={[
            <Button key="back" type="primary" onClick={() => { setLeaveResult(null); load(); }}>返回活动</Button>,
            <Button key="home" onClick={() => navigate('/')}>返回首页</Button>,
          ]}
        />
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div style={{ textAlign: 'center', padding: 80, background: '#0a0a0a', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  const { event: ev, teams, waitlist, gameNames, pubgEnabled, userLoggedIn, userPhone } = data;

  const teamColumns = [
    { title: '位置', dataIndex: 'slotNo', key: 'slotNo', width: 60, render: (_: unknown, __: unknown, idx: number) => idx + 1 },
    {
      title: '游戏名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: { filled: boolean; stats?: { found: boolean; matches: number; kda: number } | null }) => {
        if (!record.filled) return <Text type="secondary">空位</Text>;
        return (
          <Space>
            <Text>{name}</Text>
            {pubgEnabled && record.stats && record.stats.found && (
              <Tooltip title={`场次: ${record.stats.matches} | KDA: ${record.stats.kda.toFixed(2)}`}>
                <Tag color="gold" style={{ fontSize: 10 }}>{record.stats.matches}场 {record.stats.kda.toFixed(1)}KDA</Tag>
              </Tooltip>
            )}
            {pubgEnabled && record.stats && !record.stats.found && (
              <Tag color="default" style={{ fontSize: 10 }}>未找到</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone: string, record: { filled: boolean }) => record.filled ? phone : '-',
    },
  ];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px', background: '#0a0a0a', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>返回日历</Button>
        {userLoggedIn ? (
          <Space>
            <Text style={{ color: '#999', fontSize: 13 }}><UserOutlined style={{ marginRight: 4 }} />{userPhone}</Text>
            <Button size="small" icon={<LogoutOutlined />} onClick={handleLogout}>退出</Button>
          </Space>
        ) : (
          <Button
            size="small"
            icon={<LoginOutlined />}
            onClick={() => navigate(`/login?next=/date/${date}`)}
          >
            登录 / 注册
          </Button>
        )}
      </div>

      <Title level={3} style={{ color: '#f0a500' }}>{ev.eventDate} 活动</Title>

      <Space wrap style={{ marginBottom: 16 }}>
        <Tag color={ev.open ? 'green' : 'red'}>{ev.open ? '报名开放' : '已关闭'}</Tag>
        {ev.startTime && <Tag>⏰ {ev.startTime}{ev.endTime ? ` - ${ev.endTime}` : ''}</Tag>}
        <Tag>👥 {data.registeredCount}/{data.capacity}</Tag>
        <Button icon={<CopyOutlined />} size="small" onClick={handleCopyInvite}>一键邀请</Button>
      </Space>

      {ev.note && <Alert message={ev.note} type="info" style={{ marginBottom: 16 }} />}

      {teams.map((team) => (
        <Card
          key={team.teamNo}
          title={`第 ${team.teamNo} 队`}
          size="small"
          style={{ marginBottom: 12 }}
        >
          <Table
            dataSource={team.slots}
            columns={teamColumns}
            pagination={false}
            size="small"
            rowKey={(r) => `${r.teamNo}-${r.slotNo}`}
            scroll={{ x: 'max-content' }}
          />
        </Card>
      ))}

      {waitlist.length > 0 && (
        <Card title="候补名单" size="small" style={{ marginBottom: 16 }}>
          <Table
            dataSource={waitlist}
            columns={[
              { title: '序号', key: 'idx', width: 60, render: (_: unknown, __: unknown, idx: number) => idx + 1 },
              { title: '游戏名', dataIndex: 'name', key: 'name' },
              { title: '手机号', dataIndex: 'phone', key: 'phone' },
            ]}
            pagination={false}
            size="small"
            rowKey={(_, idx) => String(idx)}
            scroll={{ x: 'max-content' }}
          />
        </Card>
      )}

      {ev.open && (
        <Card title={<><UserAddOutlined /> 报名</>} style={{ marginBottom: 16 }}>
          {userLoggedIn ? (
            <>
              <div style={{ marginBottom: 12, color: '#999', fontSize: 13 }}>
                报名账号：<Text style={{ color: '#f0a500' }}>{userPhone}</Text>
              </div>
              <Form form={regForm} onFinish={handleRegister} layout="vertical">
                <Form.Item name="name" label="游戏昵称" rules={[{ required: true, message: '请输入游戏昵称' }]}>
                  {gameNames.length > 0 ? (
                    <Select
                      showSearch
                      allowClear
                      placeholder="选择或输入游戏昵称"
                      options={gameNames.map((n) => ({ label: n, value: n }))}
                      filterOption={(input, option) => (option?.label ?? '').includes(input)}
                    />
                  ) : (
                    <Input placeholder="游戏昵称" maxLength={20} />
                  )}
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={submitting} block>提交报名</Button>
                </Form.Item>
              </Form>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <Paragraph type="secondary">报名需要先登录账号</Paragraph>
              <Button
                type="primary"
                icon={<LoginOutlined />}
                onClick={() => navigate(`/login?next=/date/${date}`)}
              >
                登录 / 注册
              </Button>
            </div>
          )}
        </Card>
      )}

      <Card title={<><LogoutOutlined /> 离队</>}>
        {userLoggedIn ? (
          <>
            <Paragraph type="secondary">已登录，点击确认即可离队，系统会自动递补候补。</Paragraph>
            <Popconfirm
              title="确认离队？"
              description="离队后将失去当前位置，候补玩家会自动递补。"
              onConfirm={handleLeaveWithSession}
              okText="确认离队"
              cancelText="取消"
            >
              <Button danger loading={submitting} block>确认离队</Button>
            </Popconfirm>
          </>
        ) : (
          <>
            <Paragraph type="secondary">输入报名时使用的手机号和密码即可离队，系统会自动递补候补。</Paragraph>
            <Form form={leaveForm} onFinish={handleLeaveWithPassword} layout="vertical">
              <Form.Item name="phone" label="手机号" rules={[{ required: true, pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }]}>
                <Input placeholder="手机号" maxLength={11} />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
                <Input.Password placeholder="密码" />
              </Form.Item>
              <Form.Item>
                <Button danger htmlType="submit" loading={submitting} block>确认离队</Button>
              </Form.Item>
            </Form>
          </>
        )}
      </Card>
    </div>
  );
}
