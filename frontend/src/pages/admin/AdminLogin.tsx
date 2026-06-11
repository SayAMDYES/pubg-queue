import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, message } from 'antd';
import { ArrowLeftOutlined, UserOutlined, LockOutlined } from '@ant-design/icons';
import { adminLogin, adminCheck } from '../../api';

export default function AdminLogin() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    adminCheck().then((res) => {
      if (res.data.loggedIn) navigate('/admin');
    }).catch(() => {/* not logged in */});
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
    <div className="auth-wrap">
      <div className="auth-box">
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <LockOutlined style={{ color: 'var(--primary)', fontSize: 36, marginBottom: 12 }} />
          <div className="page-title page-title--lg" style={{ marginBottom: 6 }}>管理后台</div>
          <div className="section-label" style={{ color: 'var(--text-dim)' }}>ADMIN COMMAND CENTER</div>
        </div>

        <div className="g-card g-card--accent">
          <Form onFinish={onFinish} layout="vertical">
            <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined style={{ color: 'var(--text-dim)' }} />} placeholder="用户名" size="large" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]} style={{ marginBottom: 20 }}>
              <Input.Password prefix={<LockOutlined style={{ color: 'var(--text-dim)' }} />} placeholder="密码" size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              登录
            </Button>
          </Form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button className="page-footer__link" onClick={() => navigate('/')}><ArrowLeftOutlined /> 返回首页</button>
        </div>
      </div>
    </div>
  );
}

