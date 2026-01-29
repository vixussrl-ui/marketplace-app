import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Table, InputNumber, Typography, Space, message, Spin } from 'antd';
import MainLayout from '../components/MainLayout';
import * as theme from '../theme/constants';
import { calculatorAPI } from '../api';

const { Title, Text } = Typography;

// Helper function to format numbers without unnecessary decimals
const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '0';
  const num = parseFloat(value);
  const formatted = num.toFixed(decimals);
  return parseFloat(formatted).toString();
};

// Helper function to calculate Best Price (same logic as Print costs page)
const calculateBestPrice = (record, electricitySettings) => {
  const {
    isMultipleParts = false,
    parts = [],
    printTime = 0,
    stackSize = 1,
    costMaterial = 0,
    packagingCost = 0,
    targetPerHour = 22,
  } = record;

  const printerConsumption = electricitySettings.printerConsumption || 0.12;
  const electricityCost = electricitySettings.electricityCost || 1.11;
  const effectiveTargetPerHour = targetPerHour !== null && targetPerHour !== undefined 
    ? targetPerHour 
    : (electricitySettings.targetPrintRate || 22.00);

  if (isMultipleParts && parts && parts.length > 0) {
    let totalBestPrice = 0;
    let totalPrintTimePerPiece = 0;
    let hasValidParts = false;
    
    parts.forEach(part => {
      const partPrintTime = part.printTime !== null && part.printTime !== undefined ? part.printTime : 0;
      const partStackSize = part.stackSize !== null && part.stackSize !== undefined ? part.stackSize : 1;
      const partCostMaterial = part.costMaterial !== null && part.costMaterial !== undefined ? part.costMaterial : 0;
      
      if (partPrintTime > 0 || partCostMaterial > 0) {
        hasValidParts = true;
      }
      
      const partTimePerPiece = partStackSize > 0 ? partPrintTime / partStackSize : 0;
      totalPrintTimePerPiece += partTimePerPiece;
      
      const partPrintPerHour = partPrintTime > 0 ? (partStackSize * 60) / partPrintTime : 0;
      const partCostMaterialPerPiece = partStackSize > 0 ? partCostMaterial / partStackSize : 0;
      
      const partElectricity = partPrintTime > 0 ? (partPrintTime / 60) * printerConsumption * electricityCost : 0;
      const partElectricityPerPiece = partStackSize > 0 ? partElectricity / partStackSize : 0;
      
      const partTargetPerPiece = partPrintPerHour > 0 ? effectiveTargetPerHour / partPrintPerHour : 0;
      const partBestPrice = partTargetPerPiece + partCostMaterialPerPiece + partElectricityPerPiece;
      
      totalBestPrice += partBestPrice;
    });

    if (!hasValidParts) {
      return 0;
    }

    // Adăugăm packaging cost per produs final
    const effectivePackagingCost = packagingCost !== null && packagingCost !== undefined ? packagingCost : 0;
    return totalBestPrice + effectivePackagingCost;
  }

  // Produs simplu
  const effectivePrintTime = printTime !== null && printTime !== undefined ? printTime : 0;
  const effectiveStackSize = stackSize !== null && stackSize !== undefined ? stackSize : 1;
  const effectiveCostMaterial = costMaterial !== null && costMaterial !== undefined ? costMaterial : 0;
  
  const electricity = effectivePrintTime > 0 ? (effectivePrintTime / 60) * printerConsumption * electricityCost : 0;
  const printPerHour = effectivePrintTime > 0 ? (effectiveStackSize * 60) / effectivePrintTime : 0;
  
  const costMaterialPerPiece = effectiveStackSize > 0 ? effectiveCostMaterial / effectiveStackSize : 0;
  const electricityPerPiece = effectiveStackSize > 0 ? electricity / effectiveStackSize : 0;
  
  // Packaging cost per piesă (cost fix per produs final, nu per print)
  const effectivePackagingCost = packagingCost !== null && packagingCost !== undefined ? packagingCost : 0;
  
  const targetPerPieceForPricing = printPerHour > 0 ? effectiveTargetPerHour / printPerHour : 0;
  const bestPrice = targetPerPieceForPricing + costMaterialPerPiece + electricityPerPiece + effectivePackagingCost;

  return bestPrice;
};

export default function MarketplacePriceSetPage() {
  const [products, setProducts] = useState([]);
  const [electricitySettings, setElectricitySettings] = useState({
    printerConsumption: 0.12,
    electricityCost: 1.11,
    targetPrintRate: 22.00
  });
  const [loading, setLoading] = useState(true);
  const [marketplaceSettings, setMarketplaceSettings] = useState({}); // { productKey: { commission: %, transportCost: RON } }

  // Load products and settings from server on mount
  useEffect(() => {
    const loadCalculatorData = async () => {
      try {
        setLoading(true);
        const response = await calculatorAPI.getProducts();
        const data = response.data;
        
        if (data.products && data.products.length > 0) {
          setProducts(data.products);
        }
        
        if (data.electricity_settings) {
          setElectricitySettings(data.electricity_settings);
        }
      } catch (error) {
        console.error('Failed to load calculator data:', error);
        message.error('Failed to load products from calculator');
      } finally {
        setLoading(false);
      }
    };
    
    loadCalculatorData();
  }, []);

  const handleMarketplaceSettingChange = useCallback((productKey, field, value) => {
    setMarketplaceSettings(prev => ({
      ...prev,
      [productKey]: {
        ...prev[productKey],
        [field]: value !== null && value !== undefined ? value : 0
      }
    }));
  }, []);

  const calculateFinalPrice = useCallback((record) => {
    const bestPrice = calculateBestPrice(record, electricitySettings);
    const settings = marketplaceSettings[record.key] || {};
    const commission = settings.commission || 0;
    const transportCost = settings.transportCost || 0;

    if (bestPrice === 0) {
      return 0;
    }

    // Formula: preț_final = (Best Price + cost_transport) / (1 - comision_marketplace / 100)
    const commissionDecimal = commission / 100;
    if (commissionDecimal >= 1) {
      return 0; // Invalid commission
    }

    const finalPrice = (bestPrice + transportCost) / (1 - commissionDecimal);
    return finalPrice;
  }, [electricitySettings, marketplaceSettings]);

  const columns = useMemo(() => [
    {
      title: 'Product Name',
      dataIndex: 'productName',
      key: 'productName',
      width: 300,
      render: (text, record) => {
        const productName = text || '';
        const sku = record.sku || '';
        if (!productName && !sku) {
          return <span style={{ color: '#999' }}>—</span>;
        }
        return (
          <span>
            {productName}
            {sku && (
              <span style={{ color: '#999', marginLeft: '8px', fontSize: '14px' }}>
                ({sku})
              </span>
            )}
          </span>
        );
      },
    },
    {
      title: 'Best Price (RON)',
      key: 'bestPrice',
      width: 180,
      align: 'center',
      render: (_, record) => {
        const bestPrice = calculateBestPrice(record, electricitySettings);
        return (
          <strong style={{ color: theme.COLORS.text.muted || '#64748b', fontSize: '16px' }}>
            {formatNumber(bestPrice, 2)}
          </strong>
        );
      },
    },
    {
      title: 'Marketplace Commission (%)',
      key: 'commission',
      width: 250,
      align: 'center',
      render: (_, record) => {
        const settings = marketplaceSettings[record.key] || {};
        return (
          <InputNumber
            min={0}
            max={99.99}
            step={0.1}
            precision={2}
            value={settings.commission}
            onChange={(value) => handleMarketplaceSettingChange(record.key, 'commission', value)}
            placeholder="0.00"
            style={{ width: '100%' }}
          />
        );
      },
    },
    {
      title: 'Transport Cost (RON)',
      key: 'transportCost',
      width: 200,
      align: 'center',
      render: (_, record) => {
        const settings = marketplaceSettings[record.key] || {};
        return (
          <InputNumber
            min={0}
            step={0.01}
            precision={2}
            value={settings.transportCost}
            onChange={(value) => handleMarketplaceSettingChange(record.key, 'transportCost', value)}
            placeholder="0.00"
            style={{ width: '100%' }}
          />
        );
      },
    },
    {
      title: 'Final Price (RON)',
      key: 'finalPrice',
      width: 200,
      align: 'center',
      render: (_, record) => {
        const finalPrice = calculateFinalPrice(record);
        return (
          <strong style={{ 
            color: theme.COLORS.primary || '#1890ff', 
            fontSize: '18px',
            fontWeight: 600
          }}>
            {formatNumber(finalPrice, 2)}
          </strong>
        );
      },
    },
  ], [electricitySettings, marketplaceSettings, handleMarketplaceSettingChange, calculateFinalPrice]);

  return (
    <MainLayout currentKey="marketplace-price-set">
      <style>
        {`
          .marketplace-price-table .ant-table-tbody > tr > td {
            padding: 12px 16px !important;
            font-size: 15px !important;
          }
          .marketplace-price-table .ant-table-thead > tr > th {
            padding: 12px 16px !important;
            background: ${theme.COLORS.primaryLight} !important;
            font-weight: 600 !important;
            font-size: 16px !important;
          }
          .marketplace-price-table .ant-table-tbody > tr:hover > td {
            background: ${theme.COLORS.primaryLight} !important;
          }
          .marketplace-price-table input,
          .marketplace-price-table .ant-input-number {
            border: 1px solid ${theme.COLORS.border} !important;
            font-size: 15px !important;
            padding: 4px 8px !important;
          }
          .marketplace-price-table input:focus,
          .marketplace-price-table .ant-input-number:focus {
            border-color: ${theme.COLORS.primary} !important;
            box-shadow: 0 0 0 2px ${theme.COLORS.primaryLight} !important;
          }
        `}
      </style>
      <div style={{ width: '100%', margin: '0 auto', padding: `${theme.SPACING.md * 1.5}px` }}>
        <Card
          title={
            <Space>
              <Title level={4} style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
                Marketplace Price Set
              </Title>
            </Space>
          }
          style={theme.CARD_STYLES.base}
          styles={{
            header: {
              ...theme.CARD_STYLES.head,
              padding: `${theme.SPACING.md * 1.5}px ${theme.SPACING.lg * 1.5}px`
            },
            body: {
              ...theme.CARD_STYLES.body,
              padding: `${theme.SPACING.lg * 1.5}px`
            }
          }}
        >
          <div style={{ marginBottom: '16px', padding: '12px', background: theme.COLORS.primaryLight, borderRadius: theme.RADIUS.md }}>
            <Text type="secondary" style={{ fontSize: '14px' }}>
              <strong>Formula:</strong> Final Price = (Best Price + Transport Cost) / (1 - Marketplace Commission / 100)
            </Text>
          </div>

          <Spin spinning={loading}>
            <Table
              className="marketplace-price-table"
              columns={columns}
              dataSource={products}
              rowKey="key"
              pagination={false}
              locale={theme.TABLE_CONFIG.locale}
              style={theme.TABLE_CONFIG.tableStyle}
              rowClassName={() => theme.TABLE_CONFIG.rowClassName}
              size="small"
            />
          </Spin>
          {products.length === 0 && !loading && (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 0',
              color: theme.COLORS.text.muted,
              fontSize: '16px'
            }}>
              No products found. Please add products in the Print costs first.
            </div>
          )}
        </Card>
      </div>
    </MainLayout>
  );
}

