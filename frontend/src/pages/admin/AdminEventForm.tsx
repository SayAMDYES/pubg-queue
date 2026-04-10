import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, InputNumber, Button, message, Spin } from 'antd';
import { DatePicker, TimePicker } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { adminCreateEvent, adminUpdateEvent, adminGetEventDetail } from '../../api';

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
            eventDate: ev.eventDate ? dayjs(ev.eventDate) : undefined,
            teamCount: ev.teamCount,
            note: ev.note,
            startTime: ev.startTime ? dayjs(ev.startTime, 'HH:mm') : undefined,
            endTime: ev.endTime ? dayjs(ev.endTime, 'HH:mm') : undefined,
            actualStart: ev.actualStart ? dayjs(ev.actualStart, 'YYYY-MM-DDTHH:mm') : undefined,
            actualEnd: ev.actualEnd ? dayjs(ev.actualEnd, 'YYYY-MM-DDTHH:mm') : undefined,
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
    eventDate: dayjs.Dayjs | null;
    teamCount: number;
    note: string;
    startTime: dayjs.Dayjs | null;
    endTime: dayjs.Dayjs | null;
    actualStart: dayjs.Dayjs | null;
    actualEnd: dayjs.Dayjs | null;
  }) => {
    setSubmitting(true);
    try {
      const payload = {
        eventDate: values.eventDate?.format('YYYY-MM-DD') || '',
        teamCount: values.teamCount,
        note: values.note || '',
        startTime: values.startTime?.format('HH:mm') || '',
        endTime: values.endTime?.format('HH:mm') || '',
        actualStart: values.actualStart?.format('YYYY-MM-DDTHH:mm') || '',
        actualEnd: values.actualEnd?.format('YYYY-MM-DDTHH:mm') || '',
      };
      if (isEdit && date) {
        await adminUpdateEvent(date, payload);
        message.success('更新成功');
      } else {
        await adminCreateEvent(payload);
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
    return <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>;
  }

  return (
    <div className="page-wrap">
      <div className="page-inner" style={{ maxWidth: 600 }}>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin')}>返回</Button>
            <div className="page-title page-title--lg">{isEdit ? '编辑活动' : '新建活动'}</div>
          </div>
        </div>

        <div className="g-card">
          <Form form={form} onFinish={onFinish} layout="vertical" initialValues={{ teamCount: 2 }}>
            <Form.Item name="eventDate" label="活动日期" rules={[{ required: true, message: '请选择活动日期' }]}>
              <DatePicker
                format="YYYY-MM-DD"
                style={{ width: '100%' }}
                disabled={isEdit}
                disabledDate={(current) => !isEdit && current && current < dayjs().startOf('day')}
              />
            </Form.Item>
            <Form.Item name="teamCount" label="队伍数量" rules={[{ required: true }]}>
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="startTime" label="预计开始时间">
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="endTime" label="预计结束时间">
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="actualStart" label="实际开战时间">
              <DatePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DDTHH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="actualEnd" label="实际结束时间">
              <DatePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DDTHH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="note" label="备注">
              <Input.TextArea rows={3} placeholder="活动备注（可选）" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" loading={submitting} block size="large">
                {isEdit ? '保存修改' : '创建活动'}
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  );
}

