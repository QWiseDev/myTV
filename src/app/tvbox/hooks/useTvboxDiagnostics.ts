'use client';

import { useState } from 'react';

import type {
  DeepDiagnosticResult,
  DiagnosisResult,
  JarFixResult,
  SecurityConfig,
  SmartHealthResult,
} from '../_components/types';

/**
 * TVBox 诊断标签页的状态与操作：基础诊断、JAR 刷新、智能健康检查、
 * 源修复与深度诊断。拆分自 TVBox 配置页原逻辑，请求路径、错误哨兵
 * 对象与提示文案原样保留。
 */
export function useTvboxDiagnostics(securityConfig: SecurityConfig | null) {
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosisResult, setDiagnosisResult] =
    useState<DiagnosisResult | null>(null);
  const [refreshingJar, setRefreshingJar] = useState(false);
  const [jarRefreshMsg, setJarRefreshMsg] = useState<string | null>(null);

  // 智能健康检查状态
  const [smartHealthResult, setSmartHealthResult] =
    useState<SmartHealthResult | null>(null);
  const [smartHealthLoading, setSmartHealthLoading] = useState(false);

  // JAR源修复状态
  const [jarFixResult, setJarFixResult] = useState<JarFixResult | null>(null);
  const [jarFixLoading, setJarFixLoading] = useState(false);

  // 深度诊断状态
  const [deepDiagnosticResult, setDeepDiagnosticResult] =
    useState<DeepDiagnosticResult | null>(null);
  const [deepDiagnosticLoading, setDeepDiagnosticLoading] = useState(false);

  const handleDiagnose = async () => {
    setDiagnosing(true);
    setDiagnosisResult(null);
    try {
      const params = new URLSearchParams();
      if (securityConfig?.enableAuth && securityConfig.token) {
        params.append('token', securityConfig.token);
      }
      const response = await fetch(`/api/tvbox/diagnose?${params.toString()}`);
      const data = await response.json();
      setDiagnosisResult(data);
    } catch (error) {
      setDiagnosisResult({ error: '诊断失败，请稍后重试' });
    } finally {
      setDiagnosing(false);
    }
  };

  const handleRefreshJar = async () => {
    setRefreshingJar(true);
    setJarRefreshMsg(null);
    try {
      const response = await fetch('/api/tvbox/spider-status', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        setJarRefreshMsg(
          `✓ JAR 缓存已刷新 (${data.jar_status.source.split('/').pop()})`,
        );
        // 如果当前有诊断结果，重新诊断
        if (diagnosisResult) {
          setTimeout(() => handleDiagnose(), 500);
        }
      } else {
        setJarRefreshMsg(`✗ 刷新失败: ${data.error}`);
      }
    } catch (error) {
      setJarRefreshMsg('✗ 刷新失败，请稍后重试');
    } finally {
      setRefreshingJar(false);
      setTimeout(() => setJarRefreshMsg(null), 5000);
    }
  };

  // 智能健康检查
  const handleSmartHealthCheck = async () => {
    setSmartHealthLoading(true);
    setSmartHealthResult(null);
    try {
      const response = await fetch('/api/tvbox/smart-health');
      const data = await response.json();
      setSmartHealthResult(data);
    } catch (error) {
      setSmartHealthResult({
        success: false,
        error: '智能健康检查失败，请稍后重试',
      } as SmartHealthResult);
    } finally {
      setSmartHealthLoading(false);
    }
  };

  // JAR源修复诊断
  const handleJarFix = async () => {
    setJarFixLoading(true);
    setJarFixResult(null);
    try {
      const response = await fetch('/api/tvbox/jar-fix');
      const data = await response.json();
      setJarFixResult(data);
    } catch (error) {
      setJarFixResult({
        success: false,
        error: 'JAR源修复诊断失败，请稍后重试',
      } as JarFixResult);
    } finally {
      setJarFixLoading(false);
    }
  };

  // 深度诊断
  const handleDeepDiagnostic = async () => {
    setDeepDiagnosticLoading(true);
    setDeepDiagnosticResult(null);
    try {
      const response = await fetch('/api/tvbox/jar-diagnostic');
      const data = await response.json();
      setDeepDiagnosticResult(data);
    } catch (error) {
      // 错误哨兵对象：UI 依据 error 字段短路渲染错误分支，其余字段不会被访问
      setDeepDiagnosticResult({
        error: '深度诊断失败，请稍后重试',
      } as DeepDiagnosticResult);
    } finally {
      setDeepDiagnosticLoading(false);
    }
  };

  return {
    diagnosing,
    diagnosisResult,
    refreshingJar,
    jarRefreshMsg,
    handleDiagnose,
    handleRefreshJar,
    smartHealthResult,
    smartHealthLoading,
    handleSmartHealthCheck,
    jarFixResult,
    jarFixLoading,
    handleJarFix,
    deepDiagnosticResult,
    deepDiagnosticLoading,
    handleDeepDiagnostic,
  };
}
