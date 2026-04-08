import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, message, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { adminLogin, adminCheck } from '../../api';

const { Title } = Typography;

export default function AdminLogin() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    adminCheck().then((res) => {
      if (res.data.loggedIn) navigate('/admin');
    }).catch(() => {/* not logged in, stay on login page */});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await adminLogin(values);
      message.success('登录成功');
      navigate('/admin');
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '80px 16px', minHeight: '100vh', background: '#0a0a0a' }}>
      <Title level={3} style={{ textAlign: 'center', color: '#f0a500', marginBottom: 32 }}>🐔 管理后台</Title>
      <Card>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>登录</Button>
          </Form.Item>
        </Form>
      </Card>
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Button type="link" onClick={() => navigate('/')}>返回首页</Button>
      </div>
    </div>
  );
}
