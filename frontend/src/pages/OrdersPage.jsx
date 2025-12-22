import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, Table, Button, Space, Select, message, Tag, Tabs, Switch, Tooltip } from 'antd';
import { ReloadOutlined, ClockCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { ordersAPI, credentialsAPI, API_BASE_URL } from '../api';
import MainLayout from '../components/MainLayout';
import * as theme from '../theme/constants';

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [nextRefreshIn, setNextRefreshIn] = useState(AUTO_REFRESH_INTERVAL / 1000);
  const [oblioStock, setOblioStock] = useState({});
  const [loadingStock, setLoadingStock] = useState(false);
  
  const autoRefreshTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  const userId = localStorage.getItem('user_id');

  useEffect(() => {
    loadCredentials();
  }, []);

  useEffect(() => {
    if (credentials.length > 0) {
      loadAllOrders();
    }
  }, [credentials]);

  // Auto-refresh setup
  useEffect(() => {
    // Clear existing timers
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    if (autoRefreshEnabled && credentials.length > 0) {
      // Set up auto-refresh
      autoRefreshTimerRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          handleRefresh(true); // true = silent refresh (no success message)
        }
      }, AUTO_REFRESH_INTERVAL);

      // Set up countdown timer (updates every second)
      setNextRefreshIn(AUTO_REFRESH_INTERVAL / 1000);
      countdownTimerRef.current = setInterval(() => {
        setNextRefreshIn(prev => {
          if (prev <= 1) {
            return AUTO_REFRESH_INTERVAL / 1000;
          }
          return prev - 1;
        });
      }, 1000);
    }

    // Cleanup on unmount or when autoRefresh is disabled
    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [autoRefreshEnabled, credentials]);

  const loadCredentials = async () => {
    try {
      const res = await credentialsAPI.list(userId);
      setCredentials(res.data);
    } catch (error) {
      message.error('Failed to load credentials: ' + error.message);
    }
  };

  const loadAllOrders = async () => {
    setLoading(true);
    try {
      const allOrders = [];
      for (const cred of credentials) {
        try {
          const res = await ordersAPI.list(userId, { credential_id: cred.id });
          const ordersWithMarketplace = (res.data || []).map(order => ({
            ...order,
            marketplace: cred.platform === 1 ? 'EMAG' : 'Trendyol',
            credentialId: cred.id
          }));
          allOrders.push(...ordersWithMarketplace);
        } catch (error) {
          console.error(`Failed to load orders for credential ${cred.id}:`, error);
        }
      }
      const sorted = allOrders.sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });
      setOrders(sorted);
    } catch (error) {
      message.error('Failed to load orders: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadOblioStock = async (productCodes) => {
    if (!productCodes || productCodes.length === 0) {
      return;
    }
    
    setLoadingStock(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/oblio/stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ product_codes: productCodes })
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch Oblio stock');
      }
      
      const data = await response.json();
      setOblioStock(data.stock || {});
      console.log('[OBLIO] Stock loaded:', data.stock);
    } catch (error) {
      console.error('Failed to load Oblio stock:', error);
      // Nu afișăm mesaj de eroare pentru a nu deranja utilizatorul
    } finally {
      setLoadingStock(false);
    }
  };

  const handleOpenOrder = (record) => {
    const orderId = record.platform_order_id || record.order_id;
    const vendorCode = record.vendor_code || '';
    const orderType = record.order_type || 3;
    const url = `https://marketplace.emag.ro/order/vendor_details/${orderId}/${vendorCode}/${orderType}?openAwbModal=0`;
    window.open(url, '_blank');
  };

  const handleRefresh = async (silent = false) => {
    setLoading(true);
    try {
      for (const cred of credentials) {
        try {
          await ordersAPI.refresh(userId, cred.id);
        } catch (error) {
          console.error(`Failed to refresh credential ${cred.id}:`, error);
        }
      }
      await loadAllOrders();
      setLastRefreshTime(new Date());
      
      // Reset countdown timer
      setNextRefreshIn(AUTO_REFRESH_INTERVAL / 1000);
      
      if (!silent) {
        message.success('Orders refreshed from all marketplaces');
      } else {
        message.info('Orders auto-refreshed', 2);
      }
    } catch (error) {
      message.error('Failed to refresh: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCountdown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleAutoRefresh = (checked) => {
    setAutoRefreshEnabled(checked);
    if (checked) {
      message.success('Auto-refresh enabled (every 5 minutes)');
      setNextRefreshIn(AUTO_REFRESH_INTERVAL / 1000);
    } else {
      message.info('Auto-refresh disabled');
    }
  };

  const columns = [
    {
      title: 'Order ID',
      dataIndex: 'platform_order_id',
      key: 'platform_order_id',
      width: 150,
      render: (text) => <strong style={{ color: '#2563eb' }}>{text}</strong>,
    },
    {
      title: 'Marketplace',
      dataIndex: 'marketplace',
      key: 'marketplace',
      width: 100,
      render: (marketplace) => (
        <Tag color={marketplace === 'EMAG' ? '#ff6b35' : '#00d4ff'} style={{ fontWeight: 'bold' }}>
          {marketplace}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status) => (
        <Tag color={theme.getStatusColor(status)} style={theme.TAG_STYLES.status}>
          {status?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 250,
      render: (date) => (
        <span style={{ color: theme.COLORS.text.light, whiteSpace: 'nowrap' }}>
          <ClockCircleOutlined /> {theme.formatDate(date)}
        </span>
      ),
    },
    {
      title: 'Products',
      key: 'items',
      width: 700,
      render: (_, record) => (
        <div style={{ maxWidth: 680 }}>
          {record.items?.map((item, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: '6px',
                padding: '8px 10px',
                background: theme.COLORS.primaryLight,
                borderRadius: `${theme.RADIUS.md}px`,
                color: theme.COLORS.text.body,
                border: `1px solid ${theme.COLORS.border}`
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%'
              }}>
                <div style={{
                  fontWeight: 'bold',
                  fontSize: '14px',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {item.sku}
                </div>
                <Tag style={theme.TAG_STYLES.quantity}>Qty: {item.qty}</Tag>
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ];

  const productSummary = useMemo(() => {
    const emagProducts = {};
    const trendyolProducts = {};
    
    orders.forEach(order => {
      order.items?.forEach(item => {
        const qty = item.qty || item.quantity || 0;
        if (order.marketplace === 'EMAG') {
          emagProducts[item.sku] = (emagProducts[item.sku] || 0) + qty;
        } else {
          trendyolProducts[item.sku] = (trendyolProducts[item.sku] || 0) + qty;
        }
      });
    });
    
    return {
      emag: Object.keys(emagProducts)
        .map(sku => ({
          sku,
          emag: emagProducts[sku],
          trendyol: 0,
          total: emagProducts[sku]
        }))
        .sort((a, b) => b.total - a.total),
      trendyol: Object.keys(trendyolProducts)
        .map(sku => ({
          sku,
          emag: 0,
          trendyol: trendyolProducts[sku],
          total: trendyolProducts[sku]
        }))
        .sort((a, b) => b.total - a.total),
      combined: (() => {
        const allProducts = {};
        Object.keys(emagProducts).forEach(sku => {
          allProducts[sku] = (allProducts[sku] || { emag: 0, trendyol: 0 });
          allProducts[sku].emag = emagProducts[sku];
        });
        Object.keys(trendyolProducts).forEach(sku => {
          allProducts[sku] = (allProducts[sku] || { emag: 0, trendyol: 0 });
          allProducts[sku].trendyol = trendyolProducts[sku];
        });
        return Object.keys(allProducts)
          .map(sku => ({
            sku,
            emag: allProducts[sku].emag,
            trendyol: allProducts[sku].trendyol,
            total: allProducts[sku].emag + allProducts[sku].trendyol
          }))
          .sort((a, b) => b.total - a.total)
      })()
    };
  }, [orders]);

  // Load Oblio stock when product summary changes
  useEffect(() => {
    if (productSummary.combined.length > 0) {
      const productCodes = productSummary.combined.map(p => p.sku);
      loadOblioStock(productCodes);
    }
  }, [productSummary.combined]);

  return (
    <MainLayout currentKey="orders">
      <style>
        {theme.TAB_CSS}
        {`
          .compact-orders-table .ant-table-tbody > tr > td {
            padding: 6px 10px !important;
          }
          .compact-orders-table .ant-table-thead > tr > th {
            padding: 8px 10px !important;
          }
          .compact-orders-table .ant-table-wrapper {
            overflow-x: auto;
          }
          .compact-orders-table .ant-table-placeholder {
            margin: 0 !important;
          }
          .compact-orders-table .ant-skeleton-title {
            margin: 0 !important;
          }
          .compact-orders-table .ant-table-loading-mask {
            padding: 0 !important;
          }
          @media (max-width: 768px) {
            .compact-orders-table .ant-table-thead > tr > th,
            .compact-orders-table .ant-table-tbody > tr > td {
              padding: 4px 6px !important;
              font-size: 11px !important;
            }
          }
        `}
      </style>
      <div className="tabs-container">
        <Tabs
          defaultActiveKey="dashboard"
          className="harmony-tabs"
          centered
          tabBarGutter={8}
          style={{ background: 'transparent', margin: 0, padding: 0 }}
          tabBarStyle={{ marginBottom: 12, marginTop: 0, paddingLeft: 0, paddingTop: 0 }}
        >
        <Tabs.TabPane tab="Order Dashboard" key="dashboard">
          <Card
            title={<span style={theme.TYPOGRAPHY.heading}>Orders</span>}
            style={{
              marginTop: theme.SPACING.sm,
              ...theme.CARD_STYLES.base
            }}
            headStyle={theme.CARD_STYLES.head}
            bodyStyle={theme.CARD_STYLES.body}
            extra={
              <Space size="small" className="toolbar" wrap>
                <Tooltip title={autoRefreshEnabled ? 'Auto-refresh enabled' : 'Auto-refresh disabled'}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    padding: '4px 12px',
                    background: autoRefreshEnabled ? '#f0f9ff' : '#fafafa',
                    borderRadius: '6px',
                    border: `1px solid ${autoRefreshEnabled ? '#bae6fd' : '#e5e7eb'}`
                  }}>
                    <SyncOutlined 
                      spin={autoRefreshEnabled && loading} 
                      style={{ 
                        color: autoRefreshEnabled ? '#0284c7' : '#9ca3af',
                        fontSize: '14px'
                      }} 
                    />
                    <span style={{ 
                      fontSize: '12px', 
                      color: autoRefreshEnabled ? '#0c4a6e' : '#6b7280',
                      fontWeight: 500,
                      minWidth: '45px'
                    }}>
                      {autoRefreshEnabled ? formatCountdown(nextRefreshIn) : 'OFF'}
                    </span>
                    <Switch 
                      size="small"
                      checked={autoRefreshEnabled}
                      onChange={toggleAutoRefresh}
                    />
                  </div>
                </Tooltip>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => handleRefresh(false)}
                  loading={loading}
                  style={theme.BUTTON_STYLES.secondary}
                >
                  Refresh
                </Button>
              </Space>
            }
          >
            <Table
              className="compact-orders-table"
              columns={columns}
              dataSource={orders}
              rowKey="id"
              loading={loading}
              locale={theme.TABLE_CONFIG.locale}
              pagination={{
                ...theme.TABLE_CONFIG.pagination(20),
                showTotal: (total) => `Total ${total} orders`
              }}
              onRow={(record) => ({
                onClick: () => handleOpenOrder(record),
                ...theme.TABLE_CONFIG.rowProps(true)
              })}
              style={theme.TABLE_CONFIG.tableStyle}
              rowClassName={() => theme.TABLE_CONFIG.rowClassName}
              scroll={{ x: 900 }}
            />
          </Card>
        </Tabs.TabPane>
        <Tabs.TabPane tab="Product Summary" key="products">
          <Card
            title={<span style={theme.TYPOGRAPHY.heading}>Product Summary</span>}
            style={{
              marginTop: theme.SPACING.sm,
              ...theme.CARD_STYLES.base
            }}
            headStyle={theme.CARD_STYLES.head}
            bodyStyle={theme.CARD_STYLES.body}
          >
            <Table
              className="compact-orders-table"
              columns={[
                {
                  title: 'SKU',
                  dataIndex: 'sku',
                  key: 'sku',
                  width: '30%',
                  render: (text) => <strong style={{ color: '#2563eb', fontSize: '14px' }}>{text}</strong>,
                },
                {
                  title: 'EMAG',
                  dataIndex: 'emag',
                  key: 'emag',
                  width: '15%',
                  align: 'center',
                  render: (qty) => (
                    <Tag color="#ff6b35" style={{ 
                      fontWeight: 'bold', 
                      fontSize: '13px',
                      padding: '4px 12px',
                      borderRadius: '6px'
                    }}>
                      {qty}
                    </Tag>
                  ),
                },
                {
                  title: 'Trendyol',
                  dataIndex: 'trendyol',
                  key: 'trendyol',
                  width: '15%',
                  align: 'center',
                  render: (qty) => (
                    <Tag color="#00d4ff" style={{ 
                      fontWeight: 'bold', 
                      fontSize: '13px',
                      padding: '4px 12px',
                      borderRadius: '6px'
                    }}>
                      {qty}
                    </Tag>
                  ),
                },
                {
                  title: 'Total to Prepare',
                  dataIndex: 'total',
                  key: 'total',
                  width: '15%',
                  align: 'center',
                  render: (qty) => (
                    <Tag color="gold" style={{ 
                      fontWeight: 'bold', 
                      fontSize: '15px',
                      padding: '6px 14px',
                      borderRadius: '6px'
                    }}>
                      {qty}
                    </Tag>
                  ),
                },
                {
                  title: 'Stock Oblio',
                  dataIndex: 'sku',
                  key: 'stock',
                  width: '15%',
                  align: 'center',
                  render: (sku) => {
                    if (loadingStock) {
                      return <Tag color="blue">Loading...</Tag>;
                    }
                    const stockInfo = oblioStock[sku];
                    if (!stockInfo) {
                      return <Tag color="gray">-</Tag>;
                    }
                    const stockValue = stockInfo.stock || 0;
                    const stockColor = stockValue > 10 ? '#52c41a' : stockValue > 0 ? '#faad14' : '#f5222d';
                    return (
                      <Tag color={stockColor} style={{ 
                        fontWeight: 'bold', 
                        fontSize: '14px',
                        padding: '4px 12px',
                        borderRadius: '6px'
                      }}>
                        {stockValue}
                      </Tag>
                    );
                  },
                },
              ]}
              dataSource={productSummary.combined}
              rowKey="sku"
              loading={loading || loadingStock}
              locale={theme.TABLE_CONFIG.locale}
              pagination={{
                ...theme.TABLE_CONFIG.pagination(20),
                showTotal: (total) => `Total ${total} products`
              }}
              style={theme.TABLE_CONFIG.tableStyle}
              rowClassName={() => theme.TABLE_CONFIG.rowClassName}
              scroll={{ x: 900 }}
            />
            {productSummary.combined.length === 0 && !loading && (
              <div style={{ textAlign: 'center', color: theme.COLORS.text.muted, padding: '40px 0' }}>
                No products found
              </div>
            )}
          </Card>
        </Tabs.TabPane>
        </Tabs>
      </div>
    </MainLayout>
  );
}
