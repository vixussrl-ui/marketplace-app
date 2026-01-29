import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, Table, Button, Space, InputNumber, Input, Typography, Popconfirm, message, Modal, Form, Select } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, SettingOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import MainLayout from '../components/MainLayout';
import * as theme from '../theme/constants';
import { credentialsAPI, emagAPI, platformsAPI } from '../api';

const { Title, Text } = Typography;

const STORAGE_KEY = 'productivity_calculator_products';
const ELECTRICITY_STORAGE_KEY = 'electricity_calculator_settings';

export default function ProductivityCalculatorPage() {
  const [products, setProducts] = useState([]);
  const [editingKey, setEditingKey] = useState('');
  const [electricityModalVisible, setElectricityModalVisible] = useState(false);
  const [electricityForm] = Form.useForm();
  const [electricitySettings, setElectricitySettings] = useState({
    printerConsumption: 0.12,
    electricityCost: 1.11
  });
  const [emagRomaniaCredential, setEmagRomaniaCredential] = useState(null);

  // Load products from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProducts(parsed);
      } catch (e) {
        console.error('Failed to load saved products:', e);
      }
    }
  }, []);

  // Load electricity settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(ELECTRICITY_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setElectricitySettings(parsed);
        // Set form values only if form is mounted
        if (electricityForm) {
          electricityForm.setFieldsValue(parsed);
        }
      } catch (e) {
        console.error('Failed to load electricity settings:', e);
        if (electricityForm) {
          electricityForm.setFieldsValue(electricitySettings);
        }
      }
    } else {
      if (electricityForm) {
        electricityForm.setFieldsValue(electricitySettings);
      }
    }
  }, []);

  // Load eMAG credentials automatically on mount (România, Bulgaria, Ungaria)
  useEffect(() => {
    const loadEmagCredentials = async () => {
      try {
        const userId = localStorage.getItem('user_id');
        if (!userId) return;
        
        // Load platforms to find eMAG platform ID
        const platformsResponse = await platformsAPI.list();
        const platforms = platformsResponse.data || [];
        const emagPlatform = platforms.find(p => p.name === 'emag' || p.display_name === 'eMAG');
        const emagPlatformId = emagPlatform?.id || 1; // Default to 1 if not found
        
        // Load credentials
        const response = await credentialsAPI.list(userId);
        const allCredentials = response.data || [];
        
        // Filter eMAG credentials
        const emagCreds = allCredentials.filter(c => {
          const platformValue = c.platform || c.platform_id;
          return platformValue === emagPlatformId || 
                 platformValue === 'emag' || 
                 platformValue === 'EMAG' ||
                 platformValue === 1;
        });
        
        // Find eMAG România (not HU, not BG)
        const emagRomania = emagCreds.find(c => {
          const label = (c.account_label || '').toUpperCase();
          return !label.includes('HU') && 
                 !label.includes('HUNGARY') && 
                 !label.includes('UNGARIA') &&
                 !label.includes('EMAG.HU') &&
                 !label.includes('BG') &&
                 !label.includes('BULGARIA') &&
                 !label.includes('EMAG.BG');
        });
        
        if (emagRomania) {
          setEmagRomaniaCredential(emagRomania.id);
        }
      } catch (error) {
        console.error('Failed to load eMAG credentials:', error);
      }
    };
    loadEmagCredentials();
  }, []);

  // Save products to localStorage whenever they change
  useEffect(() => {
    if (products.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    }
  }, [products]);

  const calculateRow = useCallback((record) => {
    const {
      printTime = 0,        // H - print time în minute
      stackSize = 1,         // I - stack size
      costMaterial = 0,      // J - cost material (TOTAL per print)
      targetPerHour = 22,    // 🎯 Target lei/oră (valoare fixă, editabilă)
      commissionEmag = 10,   // K - comision emag (%)
      pretEmag = 0,          // Prețul real din eMAG (hardcoded, editabil)
    } = record;

    // 1. Electricity cost (per print) = (print time / 60) * printerConsumption * electricityCost
    const printerConsumption = electricitySettings.printerConsumption || 0.12; // kW
    const electricityCost = electricitySettings.electricityCost || 1.11; // lei/kWh
    const electricity = (printTime / 60) * printerConsumption * electricityCost;
    
    // 2. Print per hour = stack size * 60 / print time
    const printPerHour = printTime > 0 ? (stackSize * 60) / printTime : 0;
    
    // 3. Target per piesă = target / oră / print per hour
    const targetPerPiece = printPerHour > 0 ? targetPerHour / printPerHour : 0;
    
    // 4. Cost per piesă = (cost material / stackSize) + (electricity / stackSize) + target per piesă
    // Calculatorul determină prețul minim necesar pentru a atinge target-ul după comisioane și costuri
    const costMaterialPerPiece = stackSize > 0 ? costMaterial / stackSize : 0;
    const electricityPerPiece = stackSize > 0 ? electricity / stackSize : 0;
    
    const costPerPiece = costMaterialPerPiece + electricityPerPiece + targetPerPiece;
    const commissionDecimal = commissionEmag / 100;
    
    // 5. Preț minim viabil (per piesă) = cost per piesă / (1 - commission/100)
    // Acesta este prețul minim necesar pentru a atinge target-ul după comisioane și costuri
    const breakEvenPrice = costPerPiece > 0 ? costPerPiece / (1 - commissionDecimal) : 0;

    return {
      electricity: electricity.toFixed(2),
      printPerHour: printPerHour.toFixed(2),
      breakEvenPrice: breakEvenPrice.toFixed(2),
      targetPerPiece: targetPerPiece.toFixed(2),
      targetPerHour: targetPerHour.toFixed(2),
    };
  }, [electricitySettings]);

  const addNewRow = useCallback(() => {
    const newProduct = {
      key: Date.now().toString(),
      productName: '',
      sku: '', // SKU pentru preluarea prețului de pe eMAG
      printTime: 226,
      stackSize: 1,
      costMaterial: 7.54,
      targetPerHour: 22, // 🎯 Target lei/oră (valoare fixă, editabilă)
      commissionEmag: 10,
      pretEmag: 0, // Prețul real din eMAG România (hardcoded, editabil)
    };
    setProducts(prev => [...prev, newProduct]);
    setEditingKey(newProduct.key);
  }, []);

  const fetchEmagPrice = useCallback(async (record) => {
    if (!record.sku) {
      message.warning('Please enter SKU first');
      return;
    }
    if (!emagRomaniaCredential) {
      message.warning('eMAG România credential not found. Please add one in Settings.');
      return;
    }
    
    try {
      message.loading({ content: 'Fetching price from eMAG România...', key: 'fetchPrice' });
      const response = await emagAPI.getProductPrice(record.sku, emagRomaniaCredential);
      const price = response.data.price;
      
      handleCellChange(record.key, 'pretEmag', price);
      message.success({ content: `Price fetched: ${price} RON`, key: 'fetchPrice' });
    } catch (error) {
      console.error('Failed to fetch eMAG price:', error);
      message.error({ 
        content: error.response?.data?.detail || 'Failed to fetch price from eMAG România', 
        key: 'fetchPrice' 
      });
    }
  }, [emagRomaniaCredential]);

  const deleteRow = useCallback((key) => {
    setProducts(prev => prev.filter(item => item.key !== key));
    message.success('Product deleted');
  }, []);

  const isEditing = useCallback((record) => record.key === editingKey, [editingKey]);

  const edit = useCallback((record) => {
    setEditingKey(record.key);
  }, []);

  const cancel = useCallback(() => {
    setEditingKey('');
  }, []);

  const save = useCallback((key) => {
    setEditingKey('');
    message.success('Product saved');
  }, []);

  const handleCellChange = useCallback((recordKey, dataIndex, value) => {
    setProducts(prev => prev.map(item => {
      if (item.key === recordKey) {
        return { ...item, [dataIndex]: value };
      }
      return item;
    }));
  }, []);

  const EditableCell = React.memo(({ editing, dataIndex, title, record, children, inputType = 'text', ...restProps }) => {
    if (!record || !dataIndex) {
      return <td {...restProps}>{children}</td>;
    }
    
    const [localValue, setLocalValue] = useState(record[dataIndex] !== undefined ? record[dataIndex] : '');
    const inputRef = useRef(null);
    
    // Sync local value when record changes (but only if not currently editing this cell)
    useEffect(() => {
      if (!editing) {
        setLocalValue(record[dataIndex] !== undefined ? record[dataIndex] : '');
      }
    }, [record[dataIndex], editing, dataIndex]);
    
    const handleBlur = () => {
      if (record && record.key) {
        handleCellChange(record.key, dataIndex, localValue);
      }
    };
    
    const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
        handleBlur();
        if (inputRef.current) {
          inputRef.current.blur();
        }
      }
    };
    
    return (
      <td {...restProps}>
        {editing ? (
          inputType === 'number' || inputType === 'decimal' ? (
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={inputType === 'decimal' ? 0.01 : 1}
              precision={inputType === 'decimal' ? 2 : 0}
              value={localValue !== '' && localValue !== undefined && localValue !== null ? localValue : undefined}
              onChange={(value) => {
                setLocalValue(value !== null && value !== undefined ? value : '');
              }}
              onBlur={handleBlur}
              onPressEnter={handleKeyPress}
            />
          ) : (
            <Input
              ref={inputRef}
              style={{ width: '100%' }}
              value={localValue || ''}
              onChange={(e) => {
                setLocalValue(e.target.value);
              }}
              onBlur={handleBlur}
              onPressEnter={handleKeyPress}
            />
          )
        ) : (
          children
        )}
      </td>
    );
  }, (prevProps, nextProps) => {
    // Custom comparison to prevent unnecessary re-renders
    return (
      prevProps.editing === nextProps.editing &&
      prevProps.dataIndex === nextProps.dataIndex &&
      prevProps.record?.key === nextProps.record?.key &&
      prevProps.record?.[prevProps.dataIndex] === nextProps.record?.[nextProps.dataIndex]
    );
  });

  const columns = useMemo(() => [
    {
      title: 'Object',
      dataIndex: 'productName',
      key: 'productName',
      width: 300,
      editable: true,
      render: (text) => text || <span style={{ color: '#999' }}>—</span>,
    },
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 150,
      editable: true,
      render: (text) => text || <span style={{ color: '#999' }}>—</span>,
    },
    {
      title: 'preț minim viabil',
      key: 'breakEvenPrice',
      width: 180,
      align: 'right',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <strong style={{ color: theme.COLORS.text.muted || '#64748b', fontSize: '16px' }}>{calc.breakEvenPrice}</strong>;
      },
    },
    {
      title: 'pret emag romania',
      dataIndex: 'pretEmag',
      key: 'pretEmag',
      width: 200,
      editable: true,
      inputType: 'decimal',
      align: 'right',
      render: (value, record) => (
        <Space>
          <span style={{ fontSize: '15px' }}>{parseFloat(value || 0).toFixed(2)}</span>
          <Button
            type="link"
            size="small"
            icon={<CloudDownloadOutlined />}
            onClick={() => fetchEmagPrice(record)}
            title="Fetch price from eMAG România"
            style={{ padding: 0, height: 'auto' }}
          />
        </Space>
      ),
    },
    {
      title: '🎯 target RON/ora',
      dataIndex: 'targetPerHour',
      key: 'targetPerHour',
      width: 180,
      editable: true,
      inputType: 'decimal',
      align: 'right',
      render: (value) => <span style={{ fontSize: '15px', fontWeight: 600 }}>{parseFloat(value || 22).toFixed(2)}</span>,
    },
    {
      title: '🎯 target / piesă',
      key: 'targetPerPiece',
      width: 195,
      align: 'right',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <span style={{ color: theme.COLORS.text.body, fontSize: '15px' }}>{calc.targetPerPiece}</span>;
      },
    },
    {
      title: 'print per hour',
      key: 'printPerHour',
      width: 180,
      align: 'right',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <span style={{ color: theme.COLORS.text.body, fontSize: '15px' }}>{calc.printPerHour}</span>;
      },
    },
    {
      title: 'electricity',
      key: 'electricity',
      width: 150,
      align: 'right',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <span style={{ color: theme.COLORS.text.body, fontSize: '15px' }}>{calc.electricity}</span>;
      },
    },
    {
      title: 'print time',
      dataIndex: 'printTime',
      key: 'printTime',
      width: 150,
      editable: true,
      inputType: 'number',
      align: 'right',
      render: (value) => <span style={{ fontSize: '15px' }}>{value || 0}</span>,
    },
    {
      title: 'stack size',
      dataIndex: 'stackSize',
      key: 'stackSize',
      width: 150,
      editable: true,
      inputType: 'number',
      align: 'right',
      render: (value) => <span style={{ fontSize: '15px' }}>{value || 1}</span>,
    },
    {
      title: 'cost material',
      dataIndex: 'costMaterial',
      key: 'costMaterial',
      width: 180,
      editable: true,
      inputType: 'decimal',
      align: 'right',
      render: (value) => <span style={{ fontSize: '15px' }}>{parseFloat(value || 0).toFixed(2)}</span>,
    },
    {
      title: 'comision emag',
      dataIndex: 'commissionEmag',
      key: 'commissionEmag',
      width: 180,
      editable: true,
      inputType: 'decimal',
      align: 'right',
      render: (value) => <span style={{ fontSize: '15px' }}>{parseFloat(value || 10).toFixed(1)}</span>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_, record) => {
        const editable = isEditing(record);
        return editable ? (
          <Space>
            <Button
              type="primary"
              onClick={() => save(record.key)}
              size="small"
              icon={<SaveOutlined />}
            >
              Save
            </Button>
            <Button
              onClick={cancel}
              size="small"
            >
              Cancel
            </Button>
          </Space>
        ) : (
          <Space>
            <Button
              type="link"
              onClick={() => edit(record)}
              size="small"
            >
              Edit
            </Button>
            <Popconfirm
              title="Delete this product?"
              onConfirm={() => deleteRow(record.key)}
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
          </Space>
        );
      },
    },
  ], [calculateRow, isEditing, edit, save, cancel, deleteRow, fetchEmagPrice, handleCellChange]);
  
  const mergedColumns = useMemo(() => {
    return columns.map((col) => {
      if (!col.editable) {
        return col;
      }
      return {
        ...col,
        onCell: (record) => ({
          record,
          inputType: col.inputType || 'text',
          dataIndex: col.dataIndex,
          title: col.title,
          editing: isEditing(record),
        }),
      };
    });
  }, [columns, editingKey]);

  return (
    <MainLayout currentKey="calculator">
      <style>
        {`
          .ant-layout-content.content-area {
            max-width: 2800px !important;
          }
          .productivity-table .ant-table-tbody > tr > td {
            padding: 12px 18px !important;
            font-size: 15px !important;
          }
          .productivity-table .ant-table-thead > tr > th {
            padding: 15px 18px !important;
            background: ${theme.COLORS.primaryLight} !important;
            font-weight: 600 !important;
            font-size: 16px !important;
          }
          .productivity-table .ant-table-tbody > tr:hover > td {
            background: ${theme.COLORS.primaryLight} !important;
          }
          .productivity-table .ant-table-wrapper {
            overflow-x: auto;
          }
          .productivity-table input,
          .productivity-table .ant-input-number {
            border: 1px solid ${theme.COLORS.border} !important;
            font-size: 15px !important;
            padding: 6px 11px !important;
          }
          .productivity-table input:focus,
          .productivity-table .ant-input-number:focus {
            border-color: ${theme.COLORS.primary} !important;
            box-shadow: 0 0 0 2px ${theme.COLORS.primaryLight} !important;
          }
          .productivity-table .ant-btn {
            font-size: 14px !important;
            padding: 4px 12px !important;
          }
        `}
      </style>
      <div style={{ width: '100%', margin: '0 auto', padding: `${theme.SPACING.md * 1.5}px` }}>
        <Card
          title={
            <Space>
              <Title level={4} style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
                Productivity Calculator
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
                icon={<SettingOutlined />}
                onClick={() => setElectricityModalVisible(true)}
                style={{
                  fontSize: '15px',
                  padding: '6px 16px',
                  height: 'auto'
                }}
              >
                Settings
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={addNewRow}
                style={{
                  ...theme.BUTTON_STYLES.primary,
                  fontSize: '15px',
                  padding: '6px 21px',
                  height: 'auto'
                }}
              >
                Add Product
              </Button>
            </Space>
          }
        >
          <Table
            className="productivity-table"
            components={{
              body: {
                cell: EditableCell,
              },
            }}
            columns={mergedColumns}
            dataSource={products}
            rowKey="key"
            pagination={false}
            locale={theme.TABLE_CONFIG.locale}
            style={theme.TABLE_CONFIG.tableStyle}
            rowClassName={() => theme.TABLE_CONFIG.rowClassName}
            size="small"
          />
          {products.length === 0 && (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 0',
              color: theme.COLORS.text.muted,
              fontSize: '16px'
            }}>
              No products yet. Click "Add Product" to get started.
            </div>
          )}
        </Card>

        <Modal
          title="Electricity Settings"
          open={electricityModalVisible}
          onCancel={() => setElectricityModalVisible(false)}
          onOk={async () => {
            try {
              const values = await electricityForm.validateFields();
              localStorage.setItem(ELECTRICITY_STORAGE_KEY, JSON.stringify(values));
              setElectricitySettings(values);
              setElectricityModalVisible(false);
              message.success('Electricity settings saved!');
            } catch (error) {
              console.error('Validation failed:', error);
            }
          }}
          okText="Save"
          cancelText="Cancel"
          width={600}
        >
          <Form
            form={electricityForm}
            layout="vertical"
          >
            <Form.Item
              name="printerConsumption"
              label="Consum Imprimantă (kW)"
              rules={[
                { required: true, message: 'Please enter printer consumption' },
                { type: 'number', min: 0, message: 'Consumption must be positive' }
              ]}
            >
              <InputNumber
                min={0}
                step={0.01}
                precision={2}
                placeholder="0.12"
                style={{ width: '100%', fontSize: '16px' }}
              />
            </Form.Item>

            <Form.Item
              name="electricityCost"
              label="Cost Consum (lei/kWh)"
              rules={[
                { required: true, message: 'Please enter electricity cost' },
                { type: 'number', min: 0, message: 'Cost must be positive' }
              ]}
            >
              <InputNumber
                min={0}
                step={0.01}
                precision={2}
                placeholder="1.11"
                style={{ width: '100%', fontSize: '16px' }}
              />
            </Form.Item>

            <div style={{ 
              marginTop: 16, 
              padding: 12, 
              background: theme.COLORS.primaryLight, 
              borderRadius: theme.RADIUS.md 
            }}>
              <Text type="secondary" style={{ fontSize: '13px' }}>
                <strong>Formula:</strong> Electricity Cost = (Print Time / 60) × Printer Consumption (kW) × Electricity Cost (lei/kWh)
              </Text>
            </div>
          </Form>
        </Modal>
      </div>
    </MainLayout>
  );
}
