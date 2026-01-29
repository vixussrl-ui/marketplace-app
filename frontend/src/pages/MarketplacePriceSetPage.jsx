import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Table, InputNumber, Typography, Space, message, Spin, Button, Modal, Form, Input, Popconfirm, Select, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
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

// Helper function to calculate Recommended Price (same logic as Print costs page)
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
  const [calculatorProducts, setCalculatorProducts] = useState([]); // Products from calculator
  const [manualProducts, setManualProducts] = useState([]); // Manual products
  const [electricitySettings, setElectricitySettings] = useState({
    printerConsumption: 0.12,
    electricityCost: 1.11,
    targetPrintRate: 22.00
  });
  const [loading, setLoading] = useState(true);
  const [marketplaces, setMarketplaces] = useState([]); // [{ id, name, commission, transportCost, displayCurrency }]
  const [addMarketplaceModalVisible, setAddMarketplaceModalVisible] = useState(false);
  const [addProductModalVisible, setAddProductModalVisible] = useState(false);
  const [editMarketplaceModalVisible, setEditMarketplaceModalVisible] = useState(false);
  const [editingMarketplaceId, setEditingMarketplaceId] = useState(null);
  const [isEditingMarketplaces, setIsEditingMarketplaces] = useState(false);
  const [marketplaceForm] = Form.useForm();
  const [productForm] = Form.useForm();
  const [editMarketplaceForm] = Form.useForm();

  // Exchange rates (RON as base currency)
  const exchangeRates = {
    RON: 1,
    HUF: 50, // 1 RON = 50 HUF (approximate)
    EUR: 0.2 // 1 RON = 0.2 EUR (approximate, 1 EUR = 5 RON)
  };
  
  // Convert price from RON to target currency
  const convertCurrency = useCallback((priceInRON, targetCurrency) => {
    if (!targetCurrency || targetCurrency === 'RON') {
      return priceInRON;
    }
    const rate = exchangeRates[targetCurrency] || 1;
    return priceInRON * rate;
  }, []);

  // Combine calculator products and manual products for display
  const products = useMemo(() => {
    const calcProducts = (calculatorProducts || []).map(p => ({ ...p, isManual: false }));
    const manual = (manualProducts || []).map(p => ({ ...p, isManual: true }));
    return [...calcProducts, ...manual];
  }, [calculatorProducts, manualProducts]);

  // Load products and settings from server on mount
  useEffect(() => {
    const loadCalculatorData = async () => {
      try {
        setLoading(true);
        const response = await calculatorAPI.getProducts();
        const data = response.data;
        
        if (data.products && data.products.length > 0) {
          setCalculatorProducts(data.products);
        }
        
        if (data.manual_products && data.manual_products.length > 0) {
          setManualProducts(data.manual_products);
        }
        
        if (data.marketplace_settings && data.marketplace_settings.length > 0) {
          setMarketplaces(data.marketplace_settings);
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

  // Save marketplace settings and manual products to server whenever they change (debounced)
  useEffect(() => {
    if (!loading) {
      const timeoutId = setTimeout(async () => {
        try {
          await calculatorAPI.saveProducts(
            calculatorProducts, 
            electricitySettings,
            marketplaces,
            manualProducts
          );
        } catch (error) {
          console.error('Failed to save marketplace data to server:', error);
          message.error('Failed to save marketplace settings. Please try again.');
        }
      }, 1000); // Debounce: save 1 second after last change
      
      return () => clearTimeout(timeoutId);
    }
  }, [marketplaces, manualProducts, calculatorProducts, electricitySettings, loading]);

  // Calculate price for a product on a specific marketplace
  const calculateMarketplacePrice = useCallback((record, marketplace) => {
    // For manual products, use the manualBestPrice if available
    const bestPrice = record.manualBestPrice !== null && record.manualBestPrice !== undefined 
      ? record.manualBestPrice 
      : calculateBestPrice(record, electricitySettings);
    
    if (bestPrice === 0) {
      return 0;
    }

    const commission = marketplace.commission || 0;
    const transportCost = marketplace.transportCost || 0;

    // Formula: preț_final = Recommended Price + (Recommended Price * commission / 100) + transportCost
    // Sau: preț_final = Recommended Price + comision + transport
    const commissionAmount = bestPrice * (commission / 100);
    const finalPriceInRON = bestPrice + commissionAmount + transportCost;
    
    // Convert to display currency if specified
    const displayCurrency = marketplace.displayCurrency || 'RON';
    return convertCurrency(finalPriceInRON, displayCurrency);
  }, [electricitySettings, convertCurrency]);

  // Add new marketplace
  const handleAddMarketplace = useCallback(async () => {
    try {
      const values = await marketplaceForm.validateFields();
      const newMarketplace = {
        id: Date.now().toString(),
        name: values.name,
        commission: values.commission || 0,
        transportCost: values.transportCost || 0,
        displayCurrency: values.displayCurrency || 'RON'
      };
      setMarketplaces(prev => [...prev, newMarketplace]);
      setAddMarketplaceModalVisible(false);
      marketplaceForm.resetFields();
      message.success('Marketplace added successfully');
    } catch (error) {
      console.error('Validation failed:', error);
    }
  }, [marketplaceForm]);

  // Remove marketplace
  const handleRemoveMarketplace = useCallback((marketplaceId) => {
    setMarketplaces(prev => prev.filter(m => m.id !== marketplaceId));
    message.success('Marketplace removed');
  }, []);

  // Edit marketplace
  const handleEditMarketplace = useCallback((marketplaceId) => {
    const marketplace = marketplaces.find(m => m.id === marketplaceId);
    if (marketplace) {
      setEditingMarketplaceId(marketplaceId);
      editMarketplaceForm.setFieldsValue({
        name: marketplace.name,
        commission: marketplace.commission,
        transportCost: marketplace.transportCost,
        displayCurrency: marketplace.displayCurrency || 'RON'
      });
      setEditMarketplaceModalVisible(true);
    }
  }, [marketplaces, editMarketplaceForm]);

  // Save edited marketplace
  const handleSaveMarketplace = useCallback(async () => {
    try {
      const values = await editMarketplaceForm.validateFields();
      setMarketplaces(prev => prev.map(m => {
        if (m.id === editingMarketplaceId) {
          return {
            ...m,
            name: values.name,
            commission: values.commission || 0,
            transportCost: values.transportCost || 0,
            displayCurrency: values.displayCurrency || 'RON'
          };
        }
        return m;
      }));
      setEditMarketplaceModalVisible(false);
      setEditingMarketplaceId(null);
      editMarketplaceForm.resetFields();
      message.success('Marketplace updated successfully');
    } catch (error) {
      console.error('Validation failed:', error);
    }
  }, [editMarketplaceForm, editingMarketplaceId]);

  // Add new manual product
  const handleAddProduct = useCallback(async () => {
    try {
      const values = await productForm.validateFields();
      const newProduct = {
        key: Date.now().toString(),
        productName: values.productName || '',
        sku: values.sku || '',
        manualBestPrice: values.manualBestPrice || 0
      };
      setManualProducts(prev => [...prev, newProduct]);
      setAddProductModalVisible(false);
      productForm.resetFields();
      message.success('Product added successfully');
    } catch (error) {
      console.error('Validation failed:', error);
    }
  }, [productForm]);

  // Remove product
  const handleRemoveProduct = useCallback((productKey) => {
    setManualProducts(prev => prev.filter(p => p.key !== productKey));
    message.success('Product removed');
  }, []);

  // Build columns dynamically based on marketplaces
  const columns = useMemo(() => {
    const baseColumns = [
      {
        title: 'Product Name',
        dataIndex: 'productName',
        key: 'productName',
        width: 300,
        fixed: 'left',
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
              {record.isManual && (
                <span style={{ color: theme.COLORS.primary, marginLeft: '8px', fontSize: '12px', fontStyle: 'italic' }}>
                  (manual)
                </span>
              )}
            </span>
          );
        },
      },
      {
        title: (
          <Tooltip title="The recommended selling price to achieve the target print rate. Calculated as: (Target Print Rate (RON/H) / Printed items/hour) + Material Cost + Electricity Cost (RON) + Packaging Costs (RON). For multiple parts products, this is the sum of recommended prices for all parts plus packaging cost.">
            <span>Recommended Price (RON)</span>
          </Tooltip>
        ),
        key: 'bestPrice',
        width: 180,
        align: 'center',
        render: (_, record) => {
          const bestPrice = record.manualBestPrice !== null && record.manualBestPrice !== undefined 
            ? record.manualBestPrice 
            : calculateBestPrice(record, electricitySettings);
          return (
            <strong style={{ color: theme.COLORS.text.muted || '#64748b', fontSize: '16px' }}>
              {formatNumber(bestPrice, 2)}
            </strong>
          );
        },
      },
    ];

    // Add dynamic columns for each marketplace
    const marketplaceColumns = marketplaces.map(marketplace => ({
      title: (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          position: 'relative',
          width: '100%',
          paddingRight: isEditingMarketplaces ? '0' : '0',
          minWidth: '150px',
          gap: isEditingMarketplaces ? '8px' : '0'
        }}>
          <span style={{ textAlign: 'center', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{marketplace.name}</span>
          {isEditingMarketplaces && (
            <Space size="small" style={{ flexShrink: 0 }}>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEditMarketplace(marketplace.id)}
                style={{ padding: '0 4px' }}
              >
                Edit
              </Button>
              <Popconfirm
                title={`Delete marketplace "${marketplace.name}"?`}
                onConfirm={() => handleRemoveMarketplace(marketplace.id)}
                okText="Yes"
                cancelText="No"
              >
                <Button
                  type="link"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  style={{ padding: '0 4px' }}
                >
                  Delete
                </Button>
              </Popconfirm>
            </Space>
          )}
        </div>
      ),
      key: `marketplace-${marketplace.id}`,
      width: 180,
      minWidth: 150,
      align: 'center',
      render: (_, record) => {
        // Calculate price in display currency
        const price = calculateMarketplacePrice(record, marketplace);
        const displayCurrency = marketplace.displayCurrency || 'RON';
        const currencySymbol = displayCurrency === 'HUF' ? 'Ft' : displayCurrency === 'EUR' ? '€' : 'RON';
        
        // Calculate price in RON for reference (if not RON)
        let priceInRON = 0;
        if (displayCurrency !== 'RON') {
          const bestPrice = record.manualBestPrice !== null && record.manualBestPrice !== undefined 
            ? record.manualBestPrice 
            : calculateBestPrice(record, electricitySettings);
          if (bestPrice > 0) {
            const commission = marketplace.commission || 0;
            const transportCost = marketplace.transportCost || 0;
            const commissionAmount = bestPrice * (commission / 100);
            priceInRON = bestPrice + commissionAmount + transportCost;
          }
        }
        
        return (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            width: '100%',
            flexDirection: 'column',
            gap: '2px'
          }}>
            <strong style={{ 
              color: theme.COLORS.primary || '#1890ff', 
              fontSize: '16px',
              fontWeight: 600
            }}>
              {formatNumber(price, 2)} {currencySymbol}
            </strong>
            {displayCurrency !== 'RON' && priceInRON > 0 && (
              <span style={{ fontSize: '11px', color: '#999' }}>
                ({formatNumber(priceInRON, 2)} RON)
              </span>
            )}
          </div>
        );
      },
    }));

    // Add actions column
    const actionsColumn = {
      title: 'Actions',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_, record) => {
        // Only allow deletion of manual products
        if (record.isManual) {
          return (
            <Popconfirm
              title="Delete this product?"
              onConfirm={() => handleRemoveProduct(record.key)}
              okText="Yes"
              cancelText="No"
            >
              <Button
                type="link"
                danger
                size="small"
                icon={<DeleteOutlined />}
              >
                Delete
              </Button>
            </Popconfirm>
          );
        }
        return null;
      },
    };

    return [...baseColumns, ...marketplaceColumns, actionsColumn];
  }, [marketplaces, electricitySettings, calculateMarketplacePrice, calculateBestPrice, handleRemoveMarketplace, handleRemoveProduct, isEditingMarketplaces, handleEditMarketplace]);

  return (
    <MainLayout currentKey="marketplace-price-set">
      <style>
        {`
          .ant-layout-content.content-area {
            max-width: 2800px !important;
          }
          .marketplace-price-table .ant-table-tbody > tr > td {
            padding: 8px 12px !important;
            font-size: 15px !important;
          }
          .marketplace-price-table .ant-table-thead > tr > th {
            padding: 10px 12px !important;
            background: ${theme.COLORS.primaryLight} !important;
            font-weight: 600 !important;
            font-size: 16px !important;
          }
          .marketplace-price-table .ant-table-tbody > tr:hover > td {
            background: ${theme.COLORS.primaryLight} !important;
          }
          .marketplace-price-table .ant-table-wrapper {
            overflow-x: auto;
            width: 100%;
          }
          .marketplace-price-table .ant-table-container {
            overflow-x: auto !important;
          }
          .marketplace-price-table .ant-table {
            min-width: 100%;
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
          extra={
            <Space>
              <Button
                icon={<PlusOutlined />}
                onClick={() => setAddProductModalVisible(true)}
                style={{
                  fontSize: '15px',
                  padding: '6px 16px',
                  height: 'auto'
                }}
              >
                Add Product
              </Button>
              <Button
                icon={<EditOutlined />}
                onClick={() => setIsEditingMarketplaces(!isEditingMarketplaces)}
                type={isEditingMarketplaces ? 'primary' : 'default'}
                style={{
                  fontSize: '15px',
                  padding: '6px 16px',
                  height: 'auto'
                }}
              >
                {isEditingMarketplaces ? 'Done Editing' : 'Edit'}
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setAddMarketplaceModalVisible(true)}
                style={{
                  fontSize: '15px',
                  padding: '6px 16px',
                  height: 'auto'
                }}
              >
                Add Marketplace
              </Button>
            </Space>
          }
        >
          <div style={{ marginBottom: '16px', padding: '12px', background: theme.COLORS.primaryLight, borderRadius: theme.RADIUS.md }}>
            <Text type="secondary" style={{ fontSize: '14px' }}>
              <strong>Formula:</strong> Marketplace Price = Recommended Price + (Recommended Price × Commission %) + Transport Cost
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
              scroll={{ x: 'max-content', y: undefined }}
            />
          </Spin>
          {products.length === 0 && !loading && (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 0',
              color: theme.COLORS.text.muted,
              fontSize: '16px'
            }}>
              No products found. Add products from Print costs or add them manually.
            </div>
          )}
        </Card>

        {/* Add Marketplace Modal */}
        <Modal
          title="Add Marketplace"
          open={addMarketplaceModalVisible}
          onCancel={() => {
            setAddMarketplaceModalVisible(false);
            marketplaceForm.resetFields();
          }}
          onOk={handleAddMarketplace}
          okText="Add Marketplace"
          cancelText="Cancel"
          width={500}
        >
          <Form
            form={marketplaceForm}
            layout="vertical"
          >
            <Form.Item
              name="name"
              label="Marketplace Name"
              rules={[{ required: true, message: 'Please enter marketplace name' }]}
            >
              <Input placeholder="e.g., eMAG, Amazon, etc." />
            </Form.Item>
            <Form.Item
              name="commission"
              label="Commission (%)"
              rules={[
                { required: true, message: 'Please enter commission percentage' },
                { type: 'number', min: 0, max: 99.99, message: 'Commission must be between 0 and 99.99%' }
              ]}
            >
              <InputNumber
                min={0}
                max={99.99}
                step={0.1}
                precision={2}
                placeholder="0.00"
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item
              name="transportCost"
              label="Transport Cost (RON)"
              rules={[
                { required: true, message: 'Please enter transport cost' },
                { type: 'number', min: 0, message: 'Transport cost must be positive' }
              ]}
            >
              <InputNumber
                min={0}
                step={0.01}
                precision={2}
                placeholder="0.00"
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item
              name="displayCurrency"
              label="Display price in"
              rules={[{ required: true, message: 'Please select display currency' }]}
              initialValue="RON"
            >
              <Select
                style={{ width: '100%' }}
                options={[
                  { label: 'RON', value: 'RON' },
                  { label: 'HUF', value: 'HUF' },
                  { label: 'EUR', value: 'EUR' }
                ]}
              />
            </Form.Item>
          </Form>
        </Modal>

        {/* Add Product Modal */}
        <Modal
          title="Add Manual Product"
          open={addProductModalVisible}
          onCancel={() => {
            setAddProductModalVisible(false);
            productForm.resetFields();
          }}
          onOk={handleAddProduct}
          okText="Add Product"
          cancelText="Cancel"
          width={500}
        >
          <Form
            form={productForm}
            layout="vertical"
          >
            <Form.Item
              name="productName"
              label="Product Name"
              rules={[{ required: true, message: 'Please enter product name' }]}
            >
              <Input placeholder="Enter product name" />
            </Form.Item>
            <Form.Item
              name="sku"
              label="SKU (optional)"
            >
              <Input placeholder="Enter SKU" />
            </Form.Item>
            <Form.Item
              name="manualBestPrice"
              label="Recommended Price (RON)"
              rules={[
                { required: true, message: 'Please enter recommended price' },
                { type: 'number', min: 0, message: 'Recommended price must be positive' }
              ]}
            >
              <InputNumber
                min={0}
                step={0.01}
                precision={2}
                placeholder="0.00"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Form>
        </Modal>

        {/* Edit Marketplace Modal */}
        <Modal
          title="Edit Marketplace"
          open={editMarketplaceModalVisible}
          onCancel={() => {
            setEditMarketplaceModalVisible(false);
            setEditingMarketplaceId(null);
            editMarketplaceForm.resetFields();
          }}
          onOk={handleSaveMarketplace}
          okText="Save Changes"
          cancelText="Cancel"
          width={500}
        >
          <Form
            form={editMarketplaceForm}
            layout="vertical"
          >
            <Form.Item
              name="name"
              label="Marketplace Name"
              rules={[{ required: true, message: 'Please enter marketplace name' }]}
            >
              <Input placeholder="e.g., eMAG, Amazon, etc." />
            </Form.Item>
            <Form.Item
              name="commission"
              label="Commission (%)"
              rules={[
                { required: true, message: 'Please enter commission percentage' },
                { type: 'number', min: 0, max: 99.99, message: 'Commission must be between 0 and 99.99%' }
              ]}
            >
              <InputNumber
                min={0}
                max={99.99}
                step={0.1}
                precision={2}
                placeholder="0.00"
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item
              name="transportCost"
              label="Transport Cost (RON)"
              rules={[
                { required: true, message: 'Please enter transport cost' },
                { type: 'number', min: 0, message: 'Transport cost must be positive' }
              ]}
            >
              <InputNumber
                min={0}
                step={0.01}
                precision={2}
                placeholder="0.00"
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item
              name="displayCurrency"
              label="Display price in"
              rules={[{ required: true, message: 'Please select display currency' }]}
              initialValue="RON"
            >
              <Select
                style={{ width: '100%' }}
                options={[
                  { label: 'RON', value: 'RON' },
                  { label: 'HUF', value: 'HUF' },
                  { label: 'EUR', value: 'EUR' }
                ]}
              />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </MainLayout>
  );
}

