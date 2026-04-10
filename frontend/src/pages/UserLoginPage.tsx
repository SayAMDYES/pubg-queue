import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Form, Input, Button, message } from 'antd';
import { MobileOutlined, LockOutlined } from '@ant-design/icons';
import { userLogin, userMe } from '../api';

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
    <div className="auth-wrap">
      <div className="auth-box">
        {/* Logo / brand */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <div className="page-title page-title--lg" style={{ marginBottom: 6 }}>用户登录</div>
          <div className="section-label" style={{ color: 'var(--text-dim)' }}>PLAYER AUTHENTICATION</div>
        </div>

        {/* Card */}
        <div className="g-card g-card--accent">
          <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginBottom: 20 }}>
            首次使用将自动注册账号
          </p>
          <Form onFinish={onFinish} layout="vertical">
            <Form.Item
              name="phone"
              label="手机号"
              rules={[{ required: true, pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }]}
            >
              <Input prefix={<MobileOutlined style={{ color: 'var(--text-dim)' }} />} placeholder="手机号" maxLength={11} size="large" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, min: 6, message: '密码至少6位' }]}
              style={{ marginBottom: 20 }}
            >
              <Input.Password prefix={<LockOutlined style={{ color: 'var(--text-dim)' }} />} placeholder="密码（至少6位）" size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              登录 / 注册
            </Button>
          </Form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button className="page-footer__link" onClick={() => navigate('/')}>← 返回首页</button>
        </div>
      </div>
    </div>
  );
}

