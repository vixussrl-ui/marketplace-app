import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card, Table, Button, Space, Select, message, Tag, Tabs, Switch, Tooltip, Modal, Form, InputNumber, Input, Spin, Descriptions, Divider, Alert } from 'antd';
import { ReloadOutlined, ClockCircleOutlined, SelectOutlined, FileTextOutlined, SendOutlined, CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { ordersAPI, credentialsAPI, emagAPI, API_BASE_URL } from '../api';
import MainLayout from '../components/MainLayout';
import * as theme from '../theme/constants';

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [oblioStock, setOblioStock] = useState({});
  const [emagStock, setEmagStock] = useState({});
  const [trendyolStock, setTrendyolStock] = useState({});
  const [loadingStock, setLoadingStock] = useState(false);
  
  // Toggle-uri dinamice pentru fiecare credential (salvate în localStorage)
  const [credentialToggles, setCredentialToggles] = useState({});
  // Toggle-uri separate pentru fiecare marketplace Trendyol (RO, GR, BG)
  const [trendyolMarketplaceToggles, setTrendyolMarketplaceToggles] = useState({
    'TRENDYOL RO': true,
    'TRENDYOL GR': true,
    'TRENDYOL BG': true,
  });
  
  const refreshInFlightRef = useRef(false);

  // AWB Modal state
  const [awbModalVisible, setAwbModalVisible] = useState(false);
  const [awbModalLoading, setAwbModalLoading] = useState(false);
  const [awbGenerating, setAwbGenerating] = useState(false);
  const [awbOrderRecord, setAwbOrderRecord] = useState(null);
  const [awbOrderDetails, setAwbOrderDetails] = useState(null);
  const [awbCourierAccounts, setAwbCourierAccounts] = useState([]);
  const [awbAddresses, setAwbAddresses] = useState([]);
  const [awbForm] = Form.useForm();

  const userId = localStorage.getItem('user_id');
  
  // Inițializează toggle-urile pentru credentialele existente
  useEffect(() => {
    if (credentials.length > 0) {
      const toggles = {};
      credentials.forEach(cred => {
        const key = `credential_${cred.id}_enabled`;
        const saved = localStorage.getItem(key);
        toggles[cred.id] = saved !== null ? saved === 'true' : true; // default true
      });
      setCredentialToggles(toggles);
    }
  }, [credentials]);
  
  // Inițializează toggle-urile pentru marketplace-urile Trendyol
  useEffect(() => {
    const toggles = {
      'TRENDYOL RO': localStorage.getItem('trendyol_ro_enabled') !== 'false',
      'TRENDYOL GR': localStorage.getItem('trendyol_gr_enabled') !== 'false',
      'TRENDYOL BG': localStorage.getItem('trendyol_bg_enabled') !== 'false',
    };
    setTrendyolMarketplaceToggles(toggles);
  }, []);
  
  // Salvează toggle-urile în localStorage când se schimbă
  const updateCredentialToggle = (credentialId, enabled) => {
    setCredentialToggles(prev => {
      const newToggles = { ...prev, [credentialId]: enabled };
      localStorage.setItem(`credential_${credentialId}_enabled`, enabled.toString());
      return newToggles;
    });
  };
  
  // Salvează toggle-urile pentru marketplace-urile Trendyol
  const updateTrendyolMarketplaceToggle = (marketplace, enabled) => {
    setTrendyolMarketplaceToggles(prev => {
      const newToggles = { ...prev, [marketplace]: enabled };
      const key = marketplace.toLowerCase().replace(' ', '_') + '_enabled';
      localStorage.setItem(key, enabled.toString());
      return newToggles;
    });
  };
  
  // Obține numele afișat pentru un credential
  const getCredentialDisplayName = (cred) => {
    if (cred.platform === 1) {
      // eMAG - verifică dacă este Ungaria, Bulgaria sau România
      const label = cred.account_label?.toUpperCase() || '';
      if (label.includes('HU') || label.includes('HUNGARY') || label.includes('UNGARIA') || label.includes('EMAG.HU')) {
        return 'eMAG HU';
      } else if (label.includes('BG') || label.includes('BULGARIA') || label.includes('BULGARIA') || label.includes('EMAG.BG')) {
        return 'eMAG BG';
      }
      return 'eMAG RO';
    } else if (cred.platform === 2) {
      // Trendyol - verifică dacă este Grecia sau România
      const label = cred.account_label?.toUpperCase() || '';
      if (label.includes('GR') || label.includes('GREECE') || label.includes('GRECIA') || label.includes('TRENDYOL.GR')) {
        return 'Trendyol GR';
      }
      return 'Trendyol RO';
    } else if (cred.platform === 3) {
      return 'Oblio';
    } else if (cred.platform === 4) {
      return 'Etsy';
    }
    return cred.account_label || `Credential ${cred.id}`;
  };
  
  // Obține culoarea pentru un credential
  const getCredentialColor = (cred) => {
    if (cred.platform === 1) {
      const label = cred.account_label?.toUpperCase() || '';
      if (label.includes('HU') || label.includes('HUNGARY') || label.includes('UNGARIA') || label.includes('EMAG.HU')) {
        return '#8b5cf6'; // Purple pentru eMAG HU
      } else if (label.includes('BG') || label.includes('BULGARIA') || label.includes('BULGARIA') || label.includes('EMAG.BG')) {
        return '#10b981'; // Green pentru eMAG BG
      }
      return '#ff6b35'; // Orange pentru eMAG RO
    } else if (cred.platform === 2) {
      const label = cred.account_label?.toUpperCase() || '';
      if (label.includes('GR') || label.includes('GREECE') || label.includes('GRECIA') || label.includes('TRENDYOL.GR')) {
        return '#ef4444'; // Red pentru Trendyol GR
      }
      return '#00d4ff'; // Cyan pentru Trendyol RO
    } else if (cred.platform === 3) {
      return '#10b981'; // Green pentru Oblio
    } else if (cred.platform === 4) {
      return '#f59e0b'; // Amber pentru Etsy
    }
    return '#6b7280'; // Gray default
  };
  
  // Obține culoarea pentru un marketplace (folosită în tabel)
  const getMarketplaceColor = (marketplace) => {
    const marketplaceUpper = marketplace?.toUpperCase() || '';
    if (marketplaceUpper === 'EMAG RO' || marketplaceUpper === 'EMAG') {
      return '#ff6b35'; // Orange pentru eMAG RO
    } else if (marketplaceUpper === 'EMAG HU') {
      return '#8b5cf6'; // Purple pentru eMAG HU
    } else if (marketplaceUpper === 'EMAG BG') {
      return '#10b981'; // Green pentru eMAG BG
    } else if (marketplaceUpper === 'TRENDYOL RO' || marketplaceUpper === 'TRENDYOL') {
      return '#00d4ff'; // Cyan pentru Trendyol RO
    } else if (marketplaceUpper === 'TRENDYOL GR') {
      return '#ef4444'; // Red pentru Trendyol GR
    } else if (marketplaceUpper === 'OBLIO') {
      return '#10b981'; // Green pentru Oblio
    } else if (marketplaceUpper === 'ETSY') {
      return '#f59e0b'; // Amber pentru Etsy
    }
    return '#6b7280'; // Gray default
  };

  useEffect(() => {
    loadCredentials();
  }, []);

  useEffect(() => {
    if (credentials.length > 0) {
      // La încărcarea paginii, doar încărcăm comenzile din DB
      // Pentru refresh de la marketplace-uri, utilizatorul apasă butonul "Refresh"
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
          const ordersWithMarketplace = (res.data || []).map(order => {
            // Pentru Trendyol, extragem țara din vendor_code (trendyol_ro sau trendyol_gr)
            let marketplace = '';
            if (cred.platform === 1) {
              marketplace = getCredentialDisplayName(cred).toUpperCase();
            } else if (cred.platform === 2) {
              // Extragem țara din vendor_code
              const vendorCode = order.vendor_code || '';
              if (vendorCode.includes('trendyol_gr')) {
                marketplace = 'TRENDYOL GR';
              } else if (vendorCode.includes('trendyol_bg')) {
                marketplace = 'TRENDYOL BG';
              } else if (vendorCode.includes('trendyol_ro')) {
                marketplace = 'TRENDYOL RO';
              } else {
                // Fallback la account_label dacă vendor_code nu conține țara
                marketplace = getCredentialDisplayName(cred).toUpperCase();
              }
            } else if (cred.platform === 4) {
              marketplace = 'ETSY';
            } else {
              marketplace = 'OBLIO';
            }
            
            return {
              ...order,
              marketplace,
              credentialId: cred.id
            };
          });
          allOrders.push(...ordersWithMarketplace);
        } catch (error) {
          console.error(`Failed to load orders for credential ${cred.id}:`, error);
        }
      }
      // Eliminăm duplicatele bazate pe platform_order_id și marketplace
      // Dacă aceeași comandă apare pentru credentiale diferite (ex: România și Ungaria), păstrăm doar una
      const seenOrders = new Map();
      const uniqueOrders = [];
      for (const order of allOrders) {
        // Cheia de deduplicare: platform_order_id + marketplace (fără credential_id)
        const key = `${order.platform_order_id}-${order.marketplace}`;
        if (!seenOrders.has(key)) {
          seenOrders.set(key, order);
          uniqueOrders.push(order);
        } else {
          // Dacă există deja aceeași comandă, păstrăm cea mai recentă
          const existing = seenOrders.get(key);
          const existingDate = new Date(existing.created_at || 0);
          const newDate = new Date(order.created_at || 0);
          if (newDate > existingDate || (newDate.getTime() === existingDate.getTime() && order.credentialId < existing.credentialId)) {
            const index = uniqueOrders.indexOf(existing);
            uniqueOrders[index] = order;
            seenOrders.set(key, order);
          }
        }
      }
      
      const sorted = uniqueOrders.sort((a, b) => {
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
    }
  };

  const loadEmagStock = async (productCodes) => {
    if (!productCodes || productCodes.length === 0) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/emag/stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ product_codes: productCodes })
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch eMAG stock');
      }
      
      const data = await response.json();
      setEmagStock(data.stock || {});
      console.log('[EMAG] Stock loaded:', data.stock);
    } catch (error) {
      console.error('Failed to load eMAG stock:', error);
      // Nu afișăm mesaj de eroare pentru a nu deranja utilizatorul
    }
  };

  const loadTrendyolStock = async (productCodes) => {
    if (!productCodes || productCodes.length === 0) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/trendyol/stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ product_codes: productCodes })
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch Trendyol stock');
      }
      
      const data = await response.json();
      setTrendyolStock(data.stock || {});
      console.log('[TRENDYOL] Stock loaded:', data.stock);
    } catch (error) {
      console.error('Failed to load Trendyol stock:', error);
      // Nu afișăm mesaj de eroare pentru a nu deranja utilizatorul
    }
  };

  // Helper: generează URL-ul pentru o comandă specifică
  const getOrderUrl = (record) => {
    const orderId = record.platform_order_id || record.order_id;
    const vendorCode = record.vendor_code || '';
    const orderType = record.order_type || 3;
    
    const marketplace = record.marketplace?.toUpperCase() || '';
    const vendorCodeLower = vendorCode.toLowerCase();

    // Trendyol: open partner page by country
    if (marketplace.startsWith('TRENDYOL')) {
      let country = 'ro';
      if (vendorCodeLower.includes('trendyol_gr')) {
        country = 'gr';
      } else if (vendorCodeLower.includes('trendyol_bg')) {
        country = 'bg';
      } else if (vendorCodeLower.includes('trendyol_ro')) {
        country = 'ro';
      } else if (marketplace.includes('GR')) {
        country = 'gr';
      } else if (marketplace.includes('BG')) {
        country = 'bg';
      } else if (marketplace.includes('RO')) {
        country = 'ro';
      }
      return `https://partner.trendyol.com/${country}/orders/shipment-packages/created`;
    }

    // eMAG: open vendor details by country TLD
    if (marketplace.startsWith('EMAG')) {
      let domain = 'ro';
      if (marketplace === 'EMAG HU') {
        domain = 'hu';
      } else if (marketplace === 'EMAG BG') {
        domain = 'bg';
      }
      return `https://marketplace.emag.${domain}/order/vendor_details/${orderId}/${vendorCode}/${orderType}?openAwbModal=0`;
    }

    return null;
  };

  const handleOpenOrder = (record) => {
    const url = getOrderUrl(record);
    if (url) {
      window.open(url, '_blank');
    }
  };

  // Deschide toate comenzile vizibile (filtrate) în tab-uri noi
  const handleOpenAllOrders = () => {
    if (filteredOrders.length === 0) {
      message.warning('No orders to open');
      return;
    }

    // Generăm URL-uri unice (Trendyol are același URL per țară, nu duplicăm)
    const uniqueUrls = new Set();
    const urlList = [];

    for (const order of filteredOrders) {
      const url = getOrderUrl(order);
      if (url && !uniqueUrls.has(url)) {
        uniqueUrls.add(url);
        urlList.push(url);
      }
    }

    if (urlList.length === 0) {
      message.warning('No links available for these orders');
      return;
    }

    // Avertisment dacă sunt multe tab-uri
    if (urlList.length > 20) {
      const confirmed = window.confirm(`This will open ${urlList.length} tabs. Continue?`);
      if (!confirmed) return;
    }

    urlList.forEach(url => window.open(url, '_blank'));
    message.success(`Opened ${urlList.length} order link(s)`);
  };

  const handleRefresh = async () => {
    // Avoid overlapping refreshes
    if (refreshInFlightRef.current) {
      return;
    }
    refreshInFlightRef.current = true;
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
      message.success('Orders refreshed from all marketplaces');
    } catch (error) {
      message.error('Failed to refresh: ' + error.message);
    } finally {
      setLoading(false);
      refreshInFlightRef.current = false;
    }
  };

  // === AWB Generation handlers ===
  const handleOpenAwbModal = useCallback(async (record) => {
    // Doar pentru comenzi eMAG
    const marketplace = (record.marketplace || '').toUpperCase();
    if (!marketplace.startsWith('EMAG')) {
      message.warning('AWB generation is only available for eMAG orders');
      return;
    }

    setAwbOrderRecord(record);
    setAwbModalVisible(true);
    setAwbModalLoading(true);
    setAwbOrderDetails(null);
    setAwbCourierAccounts([]);
    setAwbAddresses([]);
    awbForm.resetFields();

    const credentialId = record.credentialId;
    const orderId = record.platform_order_id;

    try {
      // Fetch all needed data in parallel
      const [orderRes, courierRes, addressRes] = await Promise.all([
        emagAPI.getOrderDetails(orderId, credentialId),
        emagAPI.getCourierAccounts(credentialId),
        emagAPI.getAddresses(credentialId),
      ]);

      const order = orderRes.data?.order;
      const courierAccounts = courierRes.data?.courier_accounts || [];
      const addresses = addressRes.data?.addresses || [];

      setAwbOrderDetails(order);
      setAwbCourierAccounts(courierAccounts);
      setAwbAddresses(addresses);

      if (!order) {
        message.error('Could not fetch order details from eMAG');
        return;
      }

      // Calculăm COD (ramburs) - dacă payment_mode_id este cash/COD
      // eMAG payment modes: 1 = ramburs/COD, 7 = online card
      const paymentModeId = order.payment_mode_id;
      const isCod = paymentModeId === 1;
      
      // Calculăm totalul comenzii (cu TVA)
      let totalCod = 0;
      if (isCod) {
        const products = order.products || [];
        for (const p of products) {
          if (p.status === 1) { // Doar produse active
            const salePrice = parseFloat(p.sale_price || 0);
            const qty = parseInt(p.quantity || 0);
            const vatRate = parseFloat(p.vat_rate || 0.19);
            totalCod += salePrice * qty * (1 + vatRate);
          }
        }
        // Adăugăm shipping tax dacă există
        const shippingTax = parseFloat(order.shipping_tax || 0);
        totalCod += shippingTax;
        totalCod = Math.round(totalCod * 100) / 100;
      }

      // Căutăm adresa de pickup default
      const defaultPickupAddress = addresses.find(a => a.address_type_id === 2 && a.is_default) 
        || addresses.find(a => a.address_type_id === 2) 
        || addresses[0];

      // Determinăm currency bazat pe marketplace
      let currency = 'RON';
      if (marketplace.includes('BG')) currency = 'EUR';
      else if (marketplace.includes('HU')) currency = 'HUF';

      // Default courier account
      const defaultCourier = courierAccounts.length > 0 ? courierAccounts[0] : null;

      // Pre-fill form
      awbForm.setFieldsValue({
        parcel_number: 1,
        envelope_number: 0,
        weight: 1,
        is_oversize: 0,
        cod: totalCod,
        currency: currency,
        observation: '',
        courier_account_id: defaultCourier?.courier_account_id || undefined,
        pickup_and_return: 0,
        saturday_delivery: 0,
        sameday_delivery: 0,
        dropoff_locker: 0,
        // Sender (from seller address)
        sender_name: defaultPickupAddress?.address || '',
        sender_address_id: defaultPickupAddress?.address_id || undefined,
        // Receiver (from order customer)
        receiver_name: order.customer?.name || '',
        receiver_phone: order.customer?.shipping_phone || order.customer?.phone_1 || '',
        receiver_locality_id: order.shipping_locality_id || order.customer?.billing_locality_id || '',
      });

    } catch (error) {
      console.error('Error loading AWB data:', error);
      message.error('Failed to load order details: ' + (error.response?.data?.detail || error.message));
    } finally {
      setAwbModalLoading(false);
    }
  }, [awbForm]);

  const handleGenerateAwb = useCallback(async () => {
    try {
      const values = await awbForm.validateFields();
      const record = awbOrderRecord;
      const order = awbOrderDetails;
      
      if (!record || !order) {
        message.error('Missing order data');
        return;
      }

      setAwbGenerating(true);

      const customer = order.customer || {};
      
      // Construim sender din address_id (dacă avem) sau din adresa default
      const senderData = {};
      if (values.sender_address_id) {
        const addr = awbAddresses.find(a => String(a.address_id) === String(values.sender_address_id));
        senderData.address_id = String(values.sender_address_id);
        senderData.name = addr?.city ? `${addr.suburb || ''}, ${addr.city}`.trim() : (customer.name || 'Seller');
        senderData.contact = customer.name || 'Seller';
        senderData.phone1 = customer.phone_1 || '0000000000';
        senderData.locality_id = addr?.locality_id || 1;
        senderData.street = addr?.address || 'N/A';
      } else {
        // Fallback - use first available address info
        const addr = awbAddresses[0] || {};
        senderData.name = addr?.city ? `${addr.suburb || ''}, ${addr.city}`.trim() : 'Seller';
        senderData.contact = 'Seller';
        senderData.phone1 = '0000000000';
        senderData.locality_id = addr?.locality_id || 1;
        senderData.street = addr?.address || 'N/A';
      }

      // Construim receiver din datele comenzii
      const receiverData = {
        name: customer.name || 'Customer',
        contact: customer.shipping_contact || customer.name || 'Customer',
        phone1: (customer.shipping_phone || customer.phone_1 || '').replace(/[^0-9+]/g, ''),
        locality_id: parseInt(order.shipping_locality_id) || parseInt(customer.billing_locality_id) || 1,
        street: customer.billing_street || 'N/A',
        legal_entity: customer.legal_entity || 0,
      };

      // Verificăm locker delivery
      const shippingStreet = customer.billing_street || '';
      const lockerId = order.locker_id || '';

      const awbPayload = {
        order_id: parseInt(record.platform_order_id),
        sender: senderData,
        receiver: receiverData,
        is_oversize: values.is_oversize || 0,
        weight: values.weight || 1,
        envelope_number: values.envelope_number || 0,
        parcel_number: values.parcel_number || 1,
        cod: values.cod || 0,
        observation: values.observation || '',
        pickup_and_return: values.pickup_and_return || 0,
        saturday_delivery: values.saturday_delivery || 0,
        sameday_delivery: values.sameday_delivery || 0,
        dropoff_locker: values.dropoff_locker || 0,
      };

      if (values.courier_account_id) {
        awbPayload.courier_account_id = parseInt(values.courier_account_id);
      }
      if (values.currency) {
        awbPayload.currency = values.currency;
      }
      if (lockerId) {
        awbPayload.locker_id = lockerId;
      }

      console.log('[AWB] Generating AWB with payload:', awbPayload);

      const res = await emagAPI.generateAwb(
        record.platform_order_id,
        record.credentialId,
        awbPayload
      );

      if (res.data?.success) {
        message.success(`AWB generat cu succes pentru comanda ${record.platform_order_id}!`);
        setAwbModalVisible(false);
        // Refresh orders to reflect status change
        await handleRefresh();
      } else {
        const errorMsg = res.data?.error;
        const errorStr = Array.isArray(errorMsg) ? errorMsg.join(', ') : (typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
        message.error(`Eroare la generare AWB: ${errorStr}`);
      }
    } catch (error) {
      if (error.errorFields) {
        message.warning('Please fill in all required fields');
        return;
      }
      console.error('AWB generation error:', error);
      message.error('Failed to generate AWB: ' + (error.response?.data?.detail || error.message));
    } finally {
      setAwbGenerating(false);
    }
  }, [awbForm, awbOrderRecord, awbOrderDetails, awbAddresses, handleRefresh]);

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
      render: (marketplace) => {
        const color = getMarketplaceColor(marketplace);
        return (
          <Tag color={color} style={{ fontWeight: 'bold' }}>
            {marketplace}
          </Tag>
        );
      },
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
      width: 550,
      render: (_, record) => (
        <div style={{ maxWidth: 530 }}>
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
    {
      title: 'AWB',
      key: 'awb_action',
      width: 100,
      align: 'center',
      render: (_, record) => {
        const marketplace = (record.marketplace || '').toUpperCase();
        const isEmag = marketplace.startsWith('EMAG');
        
        if (!isEmag) {
          return <Tag color="default" style={{ fontSize: '11px' }}>N/A</Tag>;
        }
        
        return (
          <Tooltip title="Generate AWB">
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              onClick={(e) => {
                e.stopPropagation(); // Prevent row click
                handleOpenAwbModal(record);
              }}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '12px',
              }}
            >
              AWB
            </Button>
          </Tooltip>
        );
      },
    },
  ];

  // Filtrează orders în funcție de toggle-uri active pentru fiecare credential
  // Pentru Trendyol, filtrează după marketplace (TRENDYOL RO, TRENDYOL GR, TRENDYOL BG)
  // pentru a permite filtrarea separată a comenzilor din diferite țări
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const credentialId = order.credentialId;
      const marketplace = (order.marketplace || "").toUpperCase();
      
      // Pentru Trendyol, verificăm doar toggle-ul pentru marketplace-ul specific (RO, GR, BG)
      if (marketplace.startsWith("TRENDYOL")) {
        if (trendyolMarketplaceToggles[marketplace] === false) {
          return false;
        }
        return true; // Dacă marketplace-ul este activat, afișăm comanda
      }
      
      // Pentru celelalte platforme, folosim logica normală
      // Dacă nu există toggle pentru acest credential, afișăm comanda (default true)
      return credentialToggles[credentialId] !== false;
    });
  }, [orders, credentialToggles, trendyolMarketplaceToggles]);

  const productSummary = useMemo(() => {
    const emagProducts = {};
    const trendyolProducts = {};
    
    // Folosim filteredOrders în loc de orders
    filteredOrders.forEach(order => {
      order.items?.forEach(item => {
        const qty = item.qty || item.quantity || 0;
        const marketplaceUpper = (order.marketplace || '').toUpperCase();
        // Verificăm dacă marketplace-ul începe cu 'EMAG' (pentru 'EMAG RO', 'EMAG HU', etc.)
        if (marketplaceUpper.startsWith('EMAG')) {
          emagProducts[item.sku] = (emagProducts[item.sku] || 0) + qty;
        } else if (marketplaceUpper.startsWith('TRENDYOL')) {
          // Verificăm dacă marketplace-ul începe cu 'TRENDYOL' (pentru 'TRENDYOL RO', 'TRENDYOL GR', etc.)
          trendyolProducts[item.sku] = (trendyolProducts[item.sku] || 0) + qty;
        }
        // Dacă nu este nici EMAG nici TRENDYOL (ex: ETSY, OBLIO), nu îl adăugăm
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
  }, [filteredOrders]);

  // Load stock (Oblio, eMAG, Trendyol) when product summary changes
  useEffect(() => {
    if (productSummary.combined.length > 0) {
      setLoadingStock(true);
      const productCodes = productSummary.combined.map(p => p.sku);
      
      // Load all stocks in parallel
      Promise.all([
        loadOblioStock(productCodes),
        loadEmagStock(productCodes),
        loadTrendyolStock(productCodes)
      ]).finally(() => {
        setLoadingStock(false);
      });
    }
  }, [productSummary.combined]);

  // Funcție helper pentru toolbar (folosită în Order Dashboard și Product Summary)
  const renderToolbar = () => (
    <Space size="small" className="toolbar" wrap>
      {/* Toggle-uri dinamice pentru fiecare integrare */}
      {credentials.length > 0 && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          padding: '4px 12px',
          background: '#fafafa',
          borderRadius: '6px',
          border: '1px solid #e5e7eb',
          flexWrap: 'wrap'
        }}>
          <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>Show:</span>
          {credentials
            .filter(cred => cred.platform !== 3) // Excludem Oblio (platform 3) - este pentru facturi, nu comenzi
            .map(cred => {
              // Pentru Trendyol, afișăm doar toggle-uri separate pentru fiecare țară (fără butonul principal)
              if (cred.platform === 2) {
                const trendyolMarketplaces = ['TRENDYOL RO', 'TRENDYOL GR', 'TRENDYOL BG'];
                return (
                  <React.Fragment key={cred.id}>
                    {trendyolMarketplaces.map(marketplace => {
                      const marketplaceColor = getMarketplaceColor(marketplace);
                      const marketplaceEnabled = trendyolMarketplaceToggles[marketplace] !== false;
                      return (
                        <div key={marketplace} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', color: marketplaceColor, fontWeight: 500 }}>{marketplace}</span>
                          <Switch 
                            size="small"
                            checked={marketplaceEnabled}
                            onChange={(checked) => updateTrendyolMarketplaceToggle(marketplace, checked)}
                          />
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              }
              
              // Pentru celelalte platforme, afișăm toggle normal
              const displayName = getCredentialDisplayName(cred);
              const color = getCredentialColor(cred);
              const isEnabled = credentialToggles[cred.id] !== false;
              return (
                <div key={cred.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: color, fontWeight: 500 }}>{displayName}</span>
                  <Switch 
                    size="small"
                    checked={isEnabled}
                    onChange={(checked) => updateCredentialToggle(cred.id, checked)}
                  />
                </div>
              );
            })}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Tooltip title={`Open all ${filteredOrders.length} visible orders in new tabs`}>
          <Button
            icon={<SelectOutlined />}
            onClick={handleOpenAllOrders}
            disabled={filteredOrders.length === 0}
            style={theme.BUTTON_STYLES.secondary}
          >
            Open All ({filteredOrders.length})
          </Button>
        </Tooltip>
        <Button
          icon={<ReloadOutlined />}
          onClick={handleRefresh}
          loading={loading}
          style={theme.BUTTON_STYLES.secondary}
        >
          Refresh
        </Button>
        {lastRefreshTime && (
          <span style={{ 
            fontSize: '12px', 
            color: theme.COLORS.text.light,
            whiteSpace: 'nowrap'
          }}>
            <ClockCircleOutlined /> {new Date(lastRefreshTime).toLocaleTimeString('ro-RO')}
          </span>
        )}
      </div>
    </Space>
  );

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
            extra={renderToolbar()}
          >
            <Table
              className="compact-orders-table"
              columns={columns}
              dataSource={filteredOrders}
              rowKey="id"
              loading={loading}
              locale={theme.TABLE_CONFIG.locale}
              pagination={{
                ...theme.TABLE_CONFIG.pagination(50),
                showTotal: (total) => `Total ${total} orders`
              }}
              onRow={(record) => ({
                onClick: (e) => {
                  // Don't open order if clicking on a button
                  if (e.target.closest('button') || e.target.closest('.ant-btn')) return;
                  handleOpenOrder(record);
                },
                ...theme.TABLE_CONFIG.rowProps(true)
              })}
              style={theme.TABLE_CONFIG.tableStyle}
              rowClassName={() => theme.TABLE_CONFIG.rowClassName}
              scroll={{ x: 1100 }}
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
            extra={renderToolbar()}
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
                  key: 'stock_oblio',
                  width: '12%',
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
                {
                  title: 'Stock eMAG RO',
                  dataIndex: 'sku',
                  key: 'stock_emag',
                  width: '12%',
                  align: 'center',
                  render: (sku) => {
                    if (loadingStock) {
                      return <Tag color="blue">Loading...</Tag>;
                    }
                    const stockInfo = emagStock[sku];
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
                        borderRadius: '6px',
                        borderColor: '#ff6b35'
                      }}>
                        {stockValue}
                      </Tag>
                    );
                  },
                },
                {
                  title: 'Stock Trendyol',
                  dataIndex: 'sku',
                  key: 'stock_trendyol',
                  width: '12%',
                  align: 'center',
                  render: (sku) => {
                    if (loadingStock) {
                      return <Tag color="blue">Loading...</Tag>;
                    }
                    const stockInfo = trendyolStock[sku];
                    // Verificăm dacă API-ul este indisponibil
                    const apiUnavailable = trendyolStock['_api_status'] === 'unavailable';
                    
                    if (apiUnavailable || (stockInfo && stockInfo.stock === -1)) {
                      return (
                        <Tooltip title="API Trendyol Products nu este accesibil. Verifică IP whitelist sau permisiuni.">
                          <Tag color="orange" style={{ 
                            fontWeight: 'bold', 
                            fontSize: '12px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                          }}>
                            N/A
                          </Tag>
                        </Tooltip>
                      );
                    }
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
                        borderRadius: '6px',
                        borderColor: '#00d4ff'
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
      {/* AWB Generation Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileTextOutlined style={{ color: '#10b981', fontSize: '20px' }} />
            <span>Generate AWB - Order #{awbOrderRecord?.platform_order_id}</span>
          </div>
        }
        open={awbModalVisible}
        onCancel={() => { setAwbModalVisible(false); setAwbOrderRecord(null); }}
        width={700}
        footer={
          awbModalLoading ? null : [
            <Button key="cancel" onClick={() => setAwbModalVisible(false)}>
              Cancel
            </Button>,
            <Button
              key="generate"
              type="primary"
              icon={<SendOutlined />}
              loading={awbGenerating}
              onClick={handleGenerateAwb}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                fontWeight: 'bold',
              }}
            >
              Generate AWB
            </Button>
          ]
        }
      >
        {awbModalLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} spin />} />
            <p style={{ marginTop: '16px', color: '#6b7280' }}>Loading order details from eMAG...</p>
          </div>
        ) : !awbOrderDetails ? (
          <Alert type="error" message="Could not load order details. Please try again." showIcon />
        ) : (
          <>
            {/* Order Summary */}
            <Descriptions
              size="small"
              column={2}
              bordered
              style={{ marginBottom: '16px' }}
              labelStyle={{ fontWeight: 'bold', background: '#f8fafc', width: '140px' }}
            >
              <Descriptions.Item label="Order ID">
                <strong style={{ color: '#2563eb' }}>{awbOrderRecord?.platform_order_id}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Payment">
                <Tag color={awbOrderDetails?.payment_mode_id === 1 ? 'orange' : 'green'}>
                  {awbOrderDetails?.payment_mode_id === 1 ? 'Ramburs (COD)' : 'Online Card'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Customer">
                {awbOrderDetails?.customer?.name || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Phone">
                {awbOrderDetails?.customer?.shipping_phone || awbOrderDetails?.customer?.phone_1 || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Address" span={2}>
                {awbOrderDetails?.customer?.billing_street || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Products" span={2}>
                <div style={{ maxHeight: '120px', overflow: 'auto' }}>
                  {awbOrderDetails?.products?.filter(p => p.status === 1).map((p, i) => (
                    <div key={i} style={{ marginBottom: '4px', fontSize: '13px' }}>
                      <Tag color="blue" style={{ fontSize: '11px' }}>{p.part_number || p.ext_part_number || 'N/A'}</Tag>
                      {' × '}{p.quantity}{' — '}{p.name || p.product_name || 'Product'}
                    </div>
                  ))}
                </div>
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '12px 0' }}>Package Details</Divider>

            <Form
              form={awbForm}
              layout="vertical"
              size="small"
              style={{ maxWidth: '100%' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <Form.Item
                  name="parcel_number"
                  label="Parcels"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <InputNumber min={0} max={999} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  name="envelope_number"
                  label="Envelopes"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <InputNumber min={0} max={9999} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  name="weight"
                  label="Weight (kg)"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <InputNumber min={0.1} max={99999} step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <Form.Item
                  name="cod"
                  label={
                    <span>
                      COD (Ramburs) {' '}
                      <Tooltip title="Cash on delivery amount. Auto-calculated for COD orders.">
                        <span style={{ color: '#6b7280', cursor: 'help' }}>ⓘ</span>
                      </Tooltip>
                    </span>
                  }
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <InputNumber min={0} max={999999999} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="currency" label="Currency">
                  <Select>
                    <Select.Option value="RON">RON</Select.Option>
                    <Select.Option value="EUR">EUR</Select.Option>
                    <Select.Option value="HUF">HUF</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item
                  name="courier_account_id"
                  label="Courier Account"
                >
                  <Select
                    placeholder="Select courier"
                    allowClear
                  >
                    {awbCourierAccounts.map(ca => (
                      <Select.Option key={ca.courier_account_id} value={ca.courier_account_id}>
                        {ca.courier_name || `Account ${ca.courier_account_id}`}
                        {ca.courier_account_properties?.pickup_country_code ? ` (${ca.courier_account_properties.pickup_country_code})` : ''}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Form.Item
                  name="sender_address_id"
                  label="Pickup Address (Sender)"
                >
                  <Select
                    placeholder="Select pickup address"
                    allowClear
                  >
                    {awbAddresses.filter(a => a.address_type_id === 2).map(addr => (
                      <Select.Option key={addr.address_id} value={addr.address_id}>
                        {addr.city || addr.suburb || 'Address'} - {addr.address || ''}
                        {addr.is_default ? ' ★' : ''}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name="is_oversize" label="Oversize">
                  <Select>
                    <Select.Option value={0}>No</Select.Option>
                    <Select.Option value={1}>Yes</Select.Option>
                  </Select>
                </Form.Item>
              </div>

              <Form.Item name="observation" label="Observation">
                <Input.TextArea rows={2} placeholder="Optional notes for the courier..." />
              </Form.Item>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
                <Form.Item name="pickup_and_return" label="Pickup & Return" style={{ marginBottom: 0 }}>
                  <Select size="small">
                    <Select.Option value={0}>No</Select.Option>
                    <Select.Option value={1}>Yes</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item name="saturday_delivery" label="Saturday" style={{ marginBottom: 0 }}>
                  <Select size="small">
                    <Select.Option value={0}>No</Select.Option>
                    <Select.Option value={1}>Yes</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item name="sameday_delivery" label="Same Day" style={{ marginBottom: 0 }}>
                  <Select size="small">
                    <Select.Option value={0}>No</Select.Option>
                    <Select.Option value={1}>Yes</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item name="dropoff_locker" label="Drop-off Locker" style={{ marginBottom: 0 }}>
                  <Select size="small">
                    <Select.Option value={0}>No</Select.Option>
                    <Select.Option value={1}>Yes</Select.Option>
                  </Select>
                </Form.Item>
              </div>
            </Form>
          </>
        )}
      </Modal>
    </MainLayout>
  );
}
