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
  
  const autoRefreshTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const initialSyncDoneRef = useRef(false);
  const refreshInFlightRef = useRef(false);

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
      // Important:
      // - on first page load, we want the SAME behavior as the Refresh button (sync from marketplaces)
      // - afterwards (e.g. credentials edited), we can just load what exists in DB
      if (!initialSyncDoneRef.current) {
        initialSyncDoneRef.current = true;
        handleRefresh(true); // silent initial sync
      } else {
      loadAllOrders();
      }
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

  const handleOpenOrder = (record) => {
    const orderId = record.platform_order_id || record.order_id;
    const vendorCode = record.vendor_code || '';
    const orderType = record.order_type || 3;
    
    const marketplace = record.marketplace?.toUpperCase() || '';
    const vendorCodeLower = vendorCode.toLowerCase();

    // Trendyol: open partner page by country
    if (marketplace.startsWith('TRENDYOL')) {
      // Folosim exact aceeași logică de detecție ca la etichetare:
      // 1) vendor_code: trendyol_gr / trendyol_ro
      // 2) fallback pe textul marketplace-ului (TRENDYOL GR / TRENDYOL RO)
      let country = 'ro';

      if (vendorCodeLower.includes('trendyol_gr')) {
        country = 'gr';
      } else if (vendorCodeLower.includes('trendyol_bg')) {
        country = 'bg';
      } else if (vendorCodeLower.includes('trendyol_ro')) {
        country = 'ro';
      } else if (marketplace.includes('GR')) {
        // Match any variant containing GR (e.g. 'TRENDYOL GR', 'TRENDYOL_GR', etc.)
        country = 'gr';
      } else if (marketplace.includes('BG')) {
        country = 'bg';
      } else if (marketplace.includes('RO')) {
        country = 'ro';
      }

      const url = `https://partner.trendyol.com/${country}/orders/shipment-packages/created`;
      window.open(url, '_blank');
      return;
    }

    // eMAG: open vendor details by country TLD
    if (marketplace.startsWith('EMAG')) {
      let domain = 'ro'; // default
      if (marketplace === 'EMAG HU') {
        domain = 'hu';
      } else if (marketplace === 'EMAG BG') {
        domain = 'bg';
      }
      const url = `https://marketplace.emag.${domain}/order/vendor_details/${orderId}/${vendorCode}/${orderType}?openAwbModal=0`;
    window.open(url, '_blank');
      return;
    }

    // Other platforms: do nothing (avoid opening wrong marketplace)
  };

  const handleRefresh = async (silent = false) => {
    // Avoid overlapping refreshes (auto-refresh + manual click + initial sync)
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
      refreshInFlightRef.current = false;
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => handleRefresh(false)}
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
    </MainLayout>
  );
}
