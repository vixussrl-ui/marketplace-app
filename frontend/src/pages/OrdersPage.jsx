import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Button, Space, Select, message, Tag, Tabs } from 'antd';
import { ReloadOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { ordersAPI, credentialsAPI } from '../api';
import MainLayout from '../components/MainLayout';
import * as theme from '../theme/constants';

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(false);

  const userId = localStorage.getItem('user_id');

  useEffect(() => {
    loadCredentials();
  }, []);

  useEffect(() => {
    if (credentials.length > 0) {
      loadAllOrders();
    }
  }, [credentials]);

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

  const handleOpenOrder = (record) => {
    const orderId = record.platform_order_id || record.order_id;
    const vendorCode = record.vendor_code || '';
    const orderType = record.order_type || 3;
    const url = `https://marketplace.emag.ro/order/vendor_details/${orderId}/${vendorCode}/${orderType}?openAwbModal=0`;
    window.open(url, '_blank');
  };

  const handleRefresh = async () => {
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
      message.success('Orders refreshed from all marketplaces');
    } catch (error) {
      message.error('Failed to refresh: ' + error.message);
    } finally {
      setLoading(false);
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
              <Space size="small" className="toolbar">
                <Button
                  icon={<ReloadOutlined />}
                  onClick={handleRefresh}
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
              columns={[
                {
                  title: 'SKU',
                  dataIndex: 'sku',
                  key: 'sku',
                  width: '40%',
                  render: (text) => <strong>{text}</strong>,
                },
                {
                  title: 'EMAG',
                  dataIndex: 'emag',
                  key: 'emag',
                  width: '20%',
                  align: 'center',
                  render: (qty) => <Tag color="#ff6b35">{qty}</Tag>,
                },
                {
                  title: 'Trendyol',
                  dataIndex: 'trendyol',
                  key: 'trendyol',
                  width: '20%',
                  align: 'center',
                  render: (qty) => <Tag color="#00d4ff">{qty}</Tag>,
                },
                {
                  title: 'Total to Prepare',
                  dataIndex: 'total',
                  key: 'total',
                  width: '20%',
                  align: 'center',
                  render: (qty) => (
                    <Tag color="gold" style={{ fontWeight: 'bold', fontSize: '14px' }}>
                      {qty}
                    </Tag>
                  ),
                },
              ]}
              dataSource={productSummary.combined}
              rowKey="sku"
              pagination={{
                pageSize: 20,
                showTotal: (total) => `Total ${total} products`
              }}
              locale={theme.TABLE_CONFIG.locale}
            />
            {productSummary.combined.length === 0 && (
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
