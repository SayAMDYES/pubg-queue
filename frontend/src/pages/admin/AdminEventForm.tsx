import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Form, Input, InputNumber, Button, message, Typography, Space, Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { adminCreateEvent, adminUpdateEvent, adminGetEventDetail } from '../../api';

const { Title } = Typography;

export default function AdminEventForm() {
  const { date } = useParams<{ date: string }>();
  const isEdit = !!date;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (isEdit && date) {
      setLoading(true);
      adminGetEventDetail(date)
        .then((res) => {
          const ev = res.data.event;
          form.setFieldsValue({
            eventDate: ev.eventDate,
            teamCount: ev.teamCount,
            note: ev.note,
            startTime: ev.startTime,
            endTime: ev.endTime,
            actualStart: ev.actualStart,
            actualEnd: ev.actualEnd,
          });
        })
        .catch((err: Error) => {
          if (err.message === '未登录') navigate('/admin/login');
          else message.error(err.message);
        })
        .finally(() => setLoading(false));
    }
  }, [date, isEdit, form, navigate]);

  const onFinish = async (values: {
    eventDate: string;
    teamCount: number;
    note: string;
    startTime: string;
    endTime: string;
    actualStart: string;
    actualEnd: string;
  }) => {
    setSubmitting(true);
    try {
      if (isEdit && date) {
        await adminUpdateEvent(date, values);
        message.success('更新成功');
      } else {
        await adminCreateEvent(values);
        message.success('创建成功');
      }
      navigate('/admin');
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80, background: '#0a0a0a', minHeight: '100vh' }}><Spin size="large" /></div>;
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px', background: '#0a0a0a', minHeight: '100vh' }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin')}>返回</Button>
      </Space>

      <Title level={3} style={{ color: '#f0a500' }}>{isEdit ? '编辑活动' : '新建活动'}</Title>

      <Card>
        <Form form={form} onFinish={onFinish} layout="vertical" initialValues={{ teamCount: 2 }}>
          <Form.Item name="eventDate" label="活动日期" rules={[{ required: true, pattern: /^\d{4}-\d{2}-\d{2}$/, message: '格式：YYYY-MM-DD' }]}>
            <Input placeholder="2025-01-01" disabled={isEdit} />
          </Form.Item>
          <Form.Item name="teamCount" label="队伍数量" rules={[{ required: true }]}>
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="startTime" label="预计开始时间">
            <Input placeholder="HH:MM（如 20:00）" />
          </Form.Item>
          <Form.Item name="endTime" label="预计结束时间">
            <Input placeholder="HH:MM（如 23:00）" />
          </Form.Item>
          <Form.Item name="actualStart" label="实际开战时间">
            <Input placeholder="YYYY-MM-DDTHH:MM" />
          </Form.Item>
          <Form.Item name="actualEnd" label="实际结束时间">
            <Input placeholder="YYYY-MM-DDTHH:MM" />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={3} placeholder="活动备注（可选）" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} block>
              {isEdit ? '保存修改' : '创建活动'}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
