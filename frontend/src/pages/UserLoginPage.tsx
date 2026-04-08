import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Form, Input, Button, message, Typography, Space } from 'antd';
import { MobileOutlined, LockOutlined } from '@ant-design/icons';
import { userLogin, userMe } from '../api';

const { Title, Text } = Typography;

export default function UserLoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/';

  useEffect(() => {
    userMe()
      .then((res) => { if (res.data.loggedIn) navigate(next, { replace: true }); })
      .catch(() => {/* not logged in */});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onFinish = async (values: { phone: string; password: string }) => {
    setLoading(true);
    try {
      await userLogin(values);
      message.success('登录成功');
      navigate(next, { replace: true });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '登录失败';
      const errorMap: Record<string, string> = {
        invalid_phone: '手机号格式不正确',
        wrong_password: '密码错误',
        password_too_short: '密码至少6位',
      };
      message.error(errorMap[errMsg] || errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '80px 16px', minHeight: '100vh', background: '#0a0a0a' }}>
      <Title level={3} style={{ textAlign: 'center', color: '#f0a500', marginBottom: 8 }}>🐔 用户登录</Title>
      <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 32 }}>
        首次使用将自动注册账号
      </Text>
      <Card>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item
            name="phone"
            label="手机号"
            rules={[{ required: true, pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }]}
          >
            <Input prefix={<MobileOutlined />} placeholder="手机号" maxLength={11} />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, min: 6, message: '密码至少6位' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码（至少6位）" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录 / 注册
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Space>
          <Button type="link" onClick={() => navigate('/')}>返回首页</Button>
        </Space>
      </div>
    </div>
  );
}
