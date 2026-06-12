import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, message } from 'antd';
import { ArrowLeftOutlined, LockOutlined, StarOutlined } from '@ant-design/icons';
import { userMe, userChangePassword } from '../api';

interface FormValues {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ChangePasswordPage() {
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    userMe()
      .then((res) => {
        if (!res.data.loggedIn) {
          navigate('/login?next=/change-password', { replace: true });
        } else {
          setChecking(false);
        }
      })
      .catch(() => navigate('/login?next=/change-password', { replace: true }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onFinish = async (values: FormValues) => {
    setLoading(true);
    try {
      await userChangePassword({ oldPassword: values.oldPassword, newPassword: values.newPassword });
      message.success('密码修改成功，请重新登录');
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '修改失败';
      const errorMap: Record<string, string> = {
        wrong_password: '当前密码错误',
        password_too_short: '新密码至少6位',
        not_logged_in: '请先登录',
      };
      message.error(errorMap[errMsg] || errMsg);
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;

  return (
    <div className="auth-wrap">
      <div className="auth-box">
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <StarOutlined style={{ color: 'var(--primary)', fontSize: 40, marginBottom: 12 }} />
          <div className="page-title page-title--lg" style={{ marginBottom: 6 }}>修改密码</div>
          <div className="section-label" style={{ color: 'var(--text-dim)' }}>CHANGE PASSWORD</div>
        </div>

        <div className="g-card g-card--accent">
          <Form form={form} onFinish={onFinish} layout="vertical">
            <Form.Item
              name="oldPassword"
              label="当前密码"
              rules={[{ required: true, message: '请输入当前密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: 'var(--text-dim)' }} />}
                placeholder="当前密码"
                size="large"
                autoComplete="current-password"
              />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label="新密码"
              rules={[{ required: true, min: 6, message: '新密码至少6位' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: 'var(--text-dim)' }} />}
                placeholder="新密码（至少6位）"
                size="large"
                autoComplete="new-password"
              />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label="确认新密码"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '请再次输入新密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
              style={{ marginBottom: 20 }}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: 'var(--text-dim)' }} />}
                placeholder="再次输入新密码"
                size="large"
                autoComplete="new-password"
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              确认修改
            </Button>
          </Form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button className="page-footer__link" onClick={() => navigate(-1)}>
            <ArrowLeftOutlined /> 返回
          </button>
        </div>
      </div>
    </div>
  );
}
