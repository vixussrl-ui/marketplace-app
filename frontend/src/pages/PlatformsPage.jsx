import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, message, Space, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { platformsAPI, credentialsAPI, ordersAPI } from '../api';
import MainLayout from '../components/MainLayout';
import * as theme from '../theme/constants';

export default function PlatformsPage() {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(null);
  const selectedPlatform = Form.useWatch('platform_id', form);

  const userId = localStorage.getItem('user_id');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [platformsRes, credsRes] = await Promise.all([
        platformsAPI.list(),
        credentialsAPI.list(userId)
      ]);
      setPlatforms(platformsRes.data);
      setCredentials(credsRes.data);
    } catch (error) {
      message.error('Failed to load data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddOrUpdate = async (values) => {
    try {
      const vendorCode = values.vendor_code !== undefined && values.vendor_code !== null
        ? String(values.vendor_code).trim()
        : '';

      const payload = {
        ...values,
        account_label: values.account_label?.trim(),
        client_id: values.client_id?.trim(),
        client_secret: values.client_secret?.trim(),
        vendor_code: vendorCode,
        platform_id: Number(values.platform_id),
      };
      console.log('Submitting credential payload', { values, payload });
      let newCred;
      if (editing) {
        await credentialsAPI.update(editing.id, userId, payload);
        message.success('Credential updated');
      } else {
        const response = await credentialsAPI.create(userId, payload);
        newCred = response.data;
        message.success('Credential created');
      }
      form.resetFields();
      setIsModalVisible(false);
      setEditing(null);
      
      if (newCred) {
        try {
          await ordersAPI.refresh(userId, newCred.id);
          message.success('Orders refreshed');
        } catch (error) {
          console.error('Auto-refresh error:', error);
        }
      }
      
      loadData();
      
      setTimeout(() => {
        navigate('/orders');
      }, 600);
    } catch (error) {
      message.error('Failed to save: ' + error.message);
    }
  };

  const handleEdit = (record) => {
    setEditing(record);
    form.setFieldsValue(record);
    setIsModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await credentialsAPI.delete(id, userId);
      message.success('Credential deleted');
      loadData();
    } catch (error) {
      message.error('Failed to delete: ' + error.message);
    }
  };

  const columns = [
    {
      title: 'Account Label',
      dataIndex: 'account_label',
      key: 'account_label',
      render: (text) => <span style={{ fontWeight: 500, color: theme.COLORS.text.body }}>{text}</span>
    },
    {
      title: 'Platform',
      dataIndex: 'platform',
      key: 'platform',
      render: (platformId) => {
        const platform = platforms.find(p => p.id === platformId)?.display_name || 'Unknown';
        return (
          <span style={theme.TAG_STYLES.platform}>
            {platform}
          </span>
        );
      }
    },
    {
      title: 'Client ID',
      dataIndex: 'client_id',
      key: 'client_id',
      render: (text) => <span style={{ color: theme.COLORS.text.light, fontFamily: 'monospace', fontSize: '13px' }}>{text}</span>
    },
    {
      title: 'Vendor Code',
      dataIndex: 'vendor_code',
      key: 'vendor_code',
      render: (text) => <span style={{ color: theme.COLORS.text.light, fontFamily: 'monospace', fontSize: '13px', fontWeight: 600 }}>{text}</span>
    },
    {
      title: 'Last Sync',
      dataIndex: 'last_sync',
      key: 'last_sync',
      render: (text) => <span style={{ color: theme.COLORS.text.lighter, fontSize: '13px' }}>{theme.formatDate(text) !== 'N/A' ? theme.formatDate(text) : 'Never'}</span>
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button 
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
            style={theme.BUTTON_STYLES.edit}
            {...theme.createButtonHover(theme.COLORS.actions.editHover, theme.COLORS.actions.edit)}
          >
            Edit
          </Button>
          <Button 
            icon={<DeleteOutlined />} 
            danger 
            onClick={() => handleDelete(record.id)}
            style={theme.BUTTON_STYLES.delete}
            {...theme.createButtonHover(theme.COLORS.actions.deleteHover, theme.COLORS.actions.delete)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <MainLayout currentKey="settings">
      <style>
        {theme.TAB_CSS}
        {`
          .compact-settings-table .ant-table-tbody > tr > td {
            padding: 8px 12px !important;
          }
          .compact-settings-table .ant-table-thead > tr > th {
            padding: 10px 12px !important;
          }
          .compact-settings-table .ant-table-wrapper {
            overflow-x: auto;
          }
          .compact-settings-table .ant-table-placeholder {
            margin: 0 !important;
          }
          .compact-settings-table .ant-skeleton-title {
            margin: 0 !important;
          }
          .compact-settings-table .ant-table-loading-mask {
            padding: 0 !important;
          }
          @media (max-width: 768px) {
            .compact-settings-table .ant-table-thead > tr > th,
            .compact-settings-table .ant-table-tbody > tr > td {
              padding: 6px 8px !important;
              font-size: 12px !important;
            }
          }
        `}
      </style>
      <div className="tabs-container">
        <Tabs
          defaultActiveKey="integrations"
          centered
          tabBarGutter={12}
          style={{ background: 'transparent', margin: 0, padding: 0 }}
          tabBarStyle={{ marginBottom: theme.SPACING.lg, marginTop: 0, paddingLeft: 0, paddingTop: 0 }}
          className="harmony-tabs"
        >
        <Tabs.TabPane tab="Integrations" key="integrations">
          <Card
            title={<span style={theme.TYPOGRAPHY.heading}>Platform Integrations</span>}
            style={{ 
              marginTop: theme.SPACING.sm, 
              ...theme.CARD_STYLES.base
            }}
            headStyle={theme.CARD_STYLES.head}
            bodyStyle={theme.CARD_STYLES.body}
            extra={
              <Space size="middle" className="toolbar">
                <Button 
                  icon={<ReloadOutlined />} 
                  onClick={loadData} 
                  loading={loading}
                  style={theme.BUTTON_STYLES.secondary}
                >
                  Refresh
                </Button>
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />} 
                  onClick={() => {
                    setEditing(null);
                    form.resetFields();
                    setIsModalVisible(true);
                  }}
                  style={theme.BUTTON_STYLES.primary}
                  {...theme.createPrimaryButtonHover()}
                >
                  Add Credential
                </Button>
              </Space>
            }
          >
            <Table
              className="compact-settings-table"
              columns={columns}
              dataSource={credentials}
              rowKey="id"
              loading={loading}
              locale={theme.TABLE_CONFIG.locale}
              pagination={theme.TABLE_CONFIG.pagination(10)}
              onRow={() => theme.TABLE_CONFIG.rowProps(false)}
              style={theme.TABLE_CONFIG.tableStyle}
              rowClassName={() => theme.TABLE_CONFIG.rowClassName}
              scroll={{ x: 900 }}
            />
          </Card>
        </Tabs.TabPane>
        <Tabs.TabPane tab="Other Settings" key="other">
          <Card 
            title={<span style={theme.TYPOGRAPHY.heading}>Other Settings</span>}
            style={{ 
              marginTop: theme.SPACING.sm, 
              ...theme.CARD_STYLES.base
            }}
            headStyle={theme.CARD_STYLES.head}
            bodyStyle={theme.CARD_STYLES.body}
          >
            <p style={{ color: '#6b7280', fontSize: '15px', margin: 0 }}>Placeholder for future settings (notifications, UI preferences, etc.).</p>
          </Card>
        </Tabs.TabPane>
        </Tabs>
      </div>

      <Modal
        title={
          <span style={theme.MODAL_STYLES.titleStyle}>
            {editing ? 'Edit Credential' : 'Add Credential'}
          </span>
        }
        open={isModalVisible}
        onOk={() => form.submit()}
        onCancel={() => setIsModalVisible(false)}
        okText={editing ? 'Update' : 'Create'}
        cancelText="Cancel"
        okButtonProps={{ style: theme.BUTTON_STYLES.modal.ok }}
        cancelButtonProps={{ style: theme.BUTTON_STYLES.modal.cancel }}
        width={theme.MODAL_STYLES.width}
        bodyStyle={theme.MODAL_STYLES.bodyStyle}
      >
        <Form layout="vertical" form={form} onFinish={handleAddOrUpdate}>
          <Form.Item 
            label={<span style={theme.INPUT_STYLES.label}>Account Label</span>}
            name="account_label" 
            rules={[{ required: true, message: 'Please enter account label' }]}
          >
            <Input 
              placeholder="e.g., EMAG Account 1" 
              style={theme.INPUT_STYLES.base}
            />
          </Form.Item>
          <Form.Item 
            label={<span style={theme.INPUT_STYLES.label}>Platform</span>}
            name="platform_id" 
            rules={[{ required: true, message: 'Please select platform' }]}
          >
            <Select 
              placeholder="Select platform"
              style={{ borderRadius: theme.RADIUS.md }}
            >
              {platforms.map(p => (
                <Select.Option key={p.id} value={p.id}>
                  {p.display_name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        {selectedPlatform === 1 && (
          <div style={{ 
            marginTop: -8, 
            marginBottom: 16, 
            padding: '12px 16px',
            background: '#fff7e6',
            border: '1px solid #ffd591',
            borderRadius: theme.RADIUS.md,
            fontSize: '13px',
            lineHeight: '1.6'
          }}>
            <strong style={{ color: '#d46b08', display: 'block', marginBottom: 4 }}>
              ⚠️ Important pentru integrarea EMAG:
            </strong>
            <span style={{ color: '#8c5000' }}>
              Pentru ca API-ul să funcționeze, trebuie să whitelistezi IP-ul serverului în contul tău EMAG:
              <br />
              <strong>Contul meu → Profil → Detalii tehnice → Adaugă IP → </strong>
              <code style={{ 
                background: '#fff', 
                padding: '2px 6px', 
                borderRadius: 3,
                fontFamily: 'monospace',
                color: '#d46b08',
                fontWeight: 'bold'
              }}>65.109.229.145</code>
            </span>
          </div>
        )}
        <Form.Item 
          label={<span style={theme.INPUT_STYLES.label}>Client ID (Email)</span>}
          name="client_id" 
          rules={[{ required: true, message: 'Please enter client ID' }]}
        >
          <Input 
            placeholder={
              selectedPlatform === 2
                ? 'Trendyol API key'
                : selectedPlatform === 4
                ? 'Etsy Access Token (OAuth)'
                : 'email@example.com'
            }
            style={theme.INPUT_STYLES.base}
          />
        </Form.Item>
        <Form.Item 
          label={<span style={theme.INPUT_STYLES.label}>Client Secret (Password)</span>}
          name="client_secret" 
          rules={[{ required: true, message: 'Please enter client secret' }]}
        >
          <Input.Password 
            placeholder={
              selectedPlatform === 2
                ? 'Trendyol API secret'
                : selectedPlatform === 4
                ? 'Etsy API Key (optional)'
                : 'password'
            }
            style={theme.INPUT_STYLES.base}
          />
        </Form.Item>
        <Form.Item 
          label={<span style={theme.INPUT_STYLES.label}>Vendor Code</span>}
          name="vendor_code" 
          normalize={(val) => (typeof val === 'string' ? val.trim() : val)}
          rules={[{ required: true, message: 'Please enter vendor code' }]}
        >
          <Input 
            placeholder={
              selectedPlatform === 2
                ? 'Trendyol Seller ID (Entity ID)'
                : selectedPlatform === 4
                ? 'Etsy Shop ID'
                : 'vendor_code'
            }
            inputMode="text"
            autoComplete="off"
            style={theme.INPUT_STYLES.base}
          />
        </Form.Item>
        {selectedPlatform === 2 && (
          <div style={{ marginTop: 6, color: theme.COLORS.text.light, fontSize: 12 }}>
            For Trendyol use: Client ID = API key, Client Secret = API secret, Vendor Code = Seller ID (Entity ID).
          </div>
        )}
        {selectedPlatform === 4 && (
          <div style={{ marginTop: 6, color: theme.COLORS.text.light, fontSize: 12 }}>
            For Etsy use: Client ID = OAuth Access Token, Vendor Code = Shop ID. Get your access token from Etsy Developer Portal.
          </div>
        )}
      </Form>
    </Modal>
  </MainLayout>
  );
}
