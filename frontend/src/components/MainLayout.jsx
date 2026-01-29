import React from 'react';
import { Layout, Menu, Button } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api';

const { Header, Content } = Layout;

export default function MainLayout({ children, currentKey }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await authAPI.logout();
      localStorage.removeItem('token');
      localStorage.removeItem('user_id');
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <Layout className="app-shell">
      <Header className="header-bar">
        <div className="brand">
          <span className="brand-dot" />
          <span>Marketplace Admin</span>
        </div>
        <Button 
          icon={<LogoutOutlined />} 
          onClick={handleLogout}
          type="primary"
          danger
        >
          Logout
        </Button>
      </Header>

      <div className="menu-strip">
        <Menu 
          mode="horizontal" 
          selectedKeys={[currentKey]} 
          onClick={(info) => {
            if (info.key === 'orders') navigate('/orders');
            if (info.key === 'settings') navigate('/platforms');
            if (info.key === 'calculator') navigate('/calculator');
          }}
          className="main-menu"
          items={[
            { key: 'orders', label: 'Orders' },
            { key: 'calculator', label: 'Calculator' },
            { key: 'settings', label: 'Settings' }
          ]}
        />
      </div>

      <Content className="content-area">
        {children}
      </Content>
    </Layout>
  );
}
