import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, InputNumber, Input, Typography, Popconfirm, message } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import MainLayout from '../components/MainLayout';
import * as theme from '../theme/constants';

const { Title } = Typography;

const STORAGE_KEY = 'productivity_calculator_products';

export default function ProductivityCalculatorPage() {
  const [products, setProducts] = useState([]);
  const [editingKey, setEditingKey] = useState('');

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

  // Save products to localStorage whenever they change
  useEffect(() => {
    if (products.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    }
  }, [products]);

  const calculateRow = (record) => {
    const {
      printTime = 0,
      stackSize = 1,
      costMaterial = 0,
      costElectricity = 0,
      commissionShop = 15,
    } = record;

    // Cost total per unitate
    const costPerUnit = (costMaterial || 0) + (costElectricity || 0);
    
    // Calculăm prețul minim necesar pentru a acoperi costurile și comisionul
    const commissionDecimal = (commissionShop || 15) / 100;
    const minPricePerUnit = costPerUnit > 0 ? costPerUnit / (1 - commissionDecimal) : 0;
    const minPriceStack = minPricePerUnit * (stackSize || 1);
    
    // Profit per unitate (după comision)
    const profitPerUnit = minPricePerUnit - costPerUnit;
    const profitStack = profitPerUnit * (stackSize || 1);
    
    // Profit margin (%)
    const profitMargin = costPerUnit > 0 ? (profitPerUnit / costPerUnit) * 100 : 0;

    return {
      costPerUnit: costPerUnit.toFixed(2),
      minPricePerUnit: minPricePerUnit.toFixed(2),
      minPriceStack: minPriceStack.toFixed(2),
      profitPerUnit: profitPerUnit.toFixed(2),
      profitStack: profitStack.toFixed(2),
      profitMargin: profitMargin.toFixed(2),
    };
  };

  const addNewRow = () => {
    const newProduct = {
      key: Date.now().toString(),
      productName: '',
      printTime: 60,
      stackSize: 1,
      costMaterial: 0,
      costElectricity: 0,
      commissionShop: 15,
    };
    setProducts([...products, newProduct]);
    setEditingKey(newProduct.key);
  };

  const deleteRow = (key) => {
    setProducts(products.filter(item => item.key !== key));
    message.success('Product deleted');
  };

  const isEditing = (record) => record.key === editingKey;

  const edit = (record) => {
    setEditingKey(record.key);
  };

  const cancel = () => {
    setEditingKey('');
  };

  const save = (key) => {
    setEditingKey('');
    message.success('Product saved');
  };

  const EditableCell = ({ editing, dataIndex, title, record, children, inputType = 'text', ...restProps }) => {
    return (
      <td {...restProps}>
        {editing ? (
          inputType === 'number' || inputType === 'decimal' ? (
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={inputType === 'decimal' ? 0.01 : 1}
              precision={inputType === 'decimal' ? 2 : 0}
              value={record[dataIndex]}
              onChange={(value) => {
                const updated = products.map(item => {
                  if (item.key === record.key) {
                    return { ...item, [dataIndex]: value || 0 };
                  }
                  return item;
                });
                setProducts(updated);
              }}
            />
          ) : (
            <Input
              style={{ width: '100%' }}
              value={record[dataIndex] || ''}
              onChange={(e) => {
                const updated = products.map(item => {
                  if (item.key === record.key) {
                    return { ...item, [dataIndex]: e.target.value };
                  }
                  return item;
                });
                setProducts(updated);
              }}
            />
          )
        ) : (
          children
        )}
      </td>
    );
  };

  const columns = [
    {
      title: 'Product Name',
      dataIndex: 'productName',
      key: 'productName',
      width: 200,
      editable: true,
      render: (text) => text || <span style={{ color: '#999' }}>—</span>,
    },
    {
      title: 'Print Time (min)',
      dataIndex: 'printTime',
      key: 'printTime',
      width: 120,
      editable: true,
      inputType: 'number',
      align: 'right',
      render: (value) => value || 0,
    },
    {
      title: 'Stack Size',
      dataIndex: 'stackSize',
      key: 'stackSize',
      width: 100,
      editable: true,
      inputType: 'number',
      align: 'right',
      render: (value) => value || 1,
    },
    {
      title: 'Material Cost (lei)',
      dataIndex: 'costMaterial',
      key: 'costMaterial',
      width: 140,
      editable: true,
      inputType: 'decimal',
      align: 'right',
      render: (value) => parseFloat(value || 0).toFixed(2),
    },
    {
      title: 'Electricity Cost (lei)',
      dataIndex: 'costElectricity',
      key: 'costElectricity',
      width: 150,
      editable: true,
      inputType: 'decimal',
      align: 'right',
      render: (value) => parseFloat(value || 0).toFixed(2),
    },
    {
      title: 'Commission (%)',
      dataIndex: 'commissionShop',
      key: 'commissionShop',
      width: 120,
      editable: true,
      inputType: 'decimal',
      align: 'right',
      render: (value) => parseFloat(value || 15).toFixed(1),
    },
    {
      title: 'Cost/Unit (lei)',
      key: 'costPerUnit',
      width: 120,
      align: 'right',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <strong style={{ color: theme.COLORS.text.body }}>{calc.costPerUnit}</strong>;
      },
    },
    {
      title: 'Best Price/Unit (lei)',
      key: 'bestPricePerUnit',
      width: 150,
      align: 'right',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <strong style={{ color: theme.COLORS.success || '#10b981', fontSize: '14px' }}>{calc.minPricePerUnit}</strong>;
      },
    },
    {
      title: 'Best Price/Stack (lei)',
      key: 'bestPriceStack',
      width: 150,
      align: 'right',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <strong style={{ color: theme.COLORS.success || '#10b981', fontSize: '14px' }}>{calc.minPriceStack}</strong>;
      },
    },
    {
      title: 'Profit/Unit (lei)',
      key: 'profitPerUnit',
      width: 120,
      align: 'right',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <span style={{ color: theme.COLORS.success || '#10b981' }}>{calc.profitPerUnit}</span>;
      },
    },
    {
      title: 'Profit Margin (%)',
      key: 'profitMargin',
      width: 130,
      align: 'right',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <span style={{ color: theme.COLORS.success || '#10b981' }}>{calc.profitMargin}%</span>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
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
  ];

  const mergedColumns = columns.map((col) => {
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

  return (
    <MainLayout currentKey="calculator">
      <style>
        {`
          .productivity-table .ant-table-tbody > tr > td {
            padding: 8px 12px !important;
          }
          .productivity-table .ant-table-thead > tr > th {
            padding: 10px 12px !important;
            background: ${theme.COLORS.primaryLight} !important;
            font-weight: 600 !important;
          }
          .productivity-table .ant-table-tbody > tr:hover > td {
            background: ${theme.COLORS.primaryLight} !important;
          }
          .productivity-table .ant-table-wrapper {
            overflow-x: auto;
          }
          .productivity-table input {
            border: 1px solid ${theme.COLORS.border} !important;
          }
          .productivity-table input:focus {
            border-color: ${theme.COLORS.primary} !important;
            box-shadow: 0 0 0 2px ${theme.COLORS.primaryLight} !important;
          }
        `}
      </style>
      <div style={{ maxWidth: '100%', margin: '0 auto', padding: theme.SPACING.md }}>
        <Card
          title={
            <Space>
              <Title level={4} style={{ margin: 0 }}>
                Productivity Calculator
              </Title>
            </Space>
          }
          style={theme.CARD_STYLES.base}
          headStyle={theme.CARD_STYLES.head}
          bodyStyle={theme.CARD_STYLES.body}
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={addNewRow}
              style={theme.BUTTON_STYLES.primary}
            >
              Add Product
            </Button>
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
            scroll={{ x: 1500 }}
            locale={theme.TABLE_CONFIG.locale}
            style={theme.TABLE_CONFIG.tableStyle}
            rowClassName={() => theme.TABLE_CONFIG.rowClassName}
            size="small"
          />
          {products.length === 0 && (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px 0',
              color: theme.COLORS.text.muted 
            }}>
              No products yet. Click "Add Product" to get started.
            </div>
          )}
        </Card>
      </div>
    </MainLayout>
  );
}
