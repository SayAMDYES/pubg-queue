import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { RadarChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([RadarChart, TooltipComponent, SVGRenderer]);

export type StrengthRadarProps = {
  firepower: number;
  lethality: number;
  aggression: number;
  survival: number;
  operating: number;
  teamwork: number;
  name?: string;
  /** 图表高度（像素），宽度自适应容器 */
  size?: number;
};

const AXES = ['火力', '精准', '对抗', '生存', '运营', '团队'];
const ACCENT = '#f0a500';
const AXIS_COLOR = 'rgba(148,163,184,0.28)';
const LABEL_COLOR = 'rgba(226,232,240,0.78)';

// StrengthRadar 用 ECharts 渲染单个玩家的六维能力雷达图。
export default function StrengthRadar({
  firepower,
  lethality,
  aggression,
  survival,
  operating,
  teamwork,
  name,
  size = 240,
}: StrengthRadarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, undefined, { renderer: 'svg' });
    chartRef.current = chart;
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const values = [firepower, lethality, aggression, survival, operating, teamwork].map(
      (v) => Math.round((v || 0) * 10) / 10,
    );
    chart.setOption({
      tooltip: { trigger: 'item' },
      radar: {
        indicator: AXES.map((axis) => ({ name: axis, max: 100 })),
        radius: '66%',
        splitNumber: 4,
        axisName: { color: LABEL_COLOR, fontSize: 12 },
        splitLine: { lineStyle: { color: AXIS_COLOR } },
        splitArea: { areaStyle: { color: ['rgba(148,163,184,0.04)', 'rgba(148,163,184,0.09)'] } },
        axisLine: { lineStyle: { color: AXIS_COLOR } },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: values,
              name: name || '能力',
              symbolSize: 4,
              lineStyle: { color: ACCENT, width: 2 },
              areaStyle: { color: 'rgba(240,165,0,0.22)' },
              itemStyle: { color: ACCENT },
            },
          ],
        },
      ],
    });
  }, [firepower, lethality, aggression, survival, operating, teamwork, name]);

  return <div ref={containerRef} style={{ width: '100%', height: size }} />;
}
