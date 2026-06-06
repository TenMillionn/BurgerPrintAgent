import React, { useEffect, useState } from 'react';
import { useOrder } from './OrderContext';
import { Shirt, Image as ImageIcon, Trash2, Plus, Factory } from 'lucide-react';
import { fetchProducts, fetchFactories, fetchVariants, fetchProductDetail } from '../../services/api';

const ItemEditor = ({ item, index, onRemove }) => {
  const { updateItem } = useOrder();
  
  const [products, setProducts] = useState([]);
  const [factories, setFactories] = useState([]);
  const [variants, setVariants] = useState([]);
  const [productDetail, setProductDetail] = useState(null);

  useEffect(() => {
    fetchProducts().then(res => setProducts(res.data || [])).catch(console.error);
  }, []);

  useEffect(() => {
    if (item.selectedProductShortCode) {
      fetchFactories(item.selectedProductShortCode)
        .then(res => setFactories(res.data || []))
        .catch(console.error);
      
      fetchProductDetail(item.selectedProductShortCode)
        .then(res => setProductDetail(res.data))
        .catch(console.error);
    } else {
      setFactories([]);
      setProductDetail(null);
    }
  }, [item.selectedProductShortCode]);

  useEffect(() => {
    if (item.selectedProductShortCode && item.selectedPartnerId) {
      fetchVariants(item.selectedProductShortCode, item.selectedPartnerId)
        .then(res => setVariants(res.data || []))
        .catch(console.error);
    } else {
      setVariants([]);
    }
  }, [item.selectedProductShortCode, item.selectedPartnerId]);

  const uniqueColors = [...new Map(variants.map(v => [v.color_hex, { hex: v.color_hex, name: v.color }])).values()];
  const uniqueSizes = [...new Set(variants.filter(v => (!item.selectedColor || v.color_hex === item.selectedColor)).map(v => v.size))];

  const update = (data) => updateItem(item.id, data);

  const printAreas = productDetail?.printAreas || [{ position: 'front' }];

  return (
    <div className="space-y-6 border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800 relative">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100">Item {index + 1}</h4>
        {onRemove && (
          <button onClick={() => onRemove(item.id)} className="text-red-500 hover:text-red-700">
            <Trash2 size={18} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* Product Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Product *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Shirt className="h-5 w-5 text-gray-400" />
              </div>
              <select
                value={item.selectedProductShortCode}
                onChange={(e) => update({ 
                  selectedProductShortCode: e.target.value, 
                  catalog_sku: products.find(p => p.shortCode === e.target.value)?.id || '',
                  selectedPartnerId: '', 
                  selectedColor: '', 
                  selectedSize: '' 
                })}
                className="pl-10 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border"
              >
                <option value="">Select a Product</option>
                {products.map(p => (
                  <option key={p.id} value={p.shortCode}>{p.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Partner Selection */}
          {item.selectedProductShortCode && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Fulfillment Partner *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Factory className="h-5 w-5 text-gray-400" />
                </div>
                <select
                  value={item.selectedPartnerId}
                  onChange={(e) => update({ selectedPartnerId: e.target.value, selectedColor: '', selectedSize: '' })}
                  className="pl-10 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border"
                >
                  <option value="">Select Partner</option>
                  {factories.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Color & Size Selection */}
          {item.selectedPartnerId && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Color *
                </label>
                <div className="flex flex-wrap gap-2">
                  {uniqueColors.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => update({ selectedColor: c.hex, selectedSize: '' })}
                      title={c.name}
                      className={`w-8 h-8 rounded-full border-2 ${item.selectedColor === c.hex ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'}`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Size *
                </label>
                <select
                  value={item.selectedSize}
                  onChange={(e) => update({ selectedSize: e.target.value })}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border"
                  disabled={!item.selectedColor}
                >
                  <option value="">Select Size</option>
                  {uniqueSizes.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Quantity *
            </label>
            <input
              type="number"
              min="1"
              value={item.quantity}
              onChange={(e) => update({ quantity: parseInt(e.target.value) || 1 })}
              className="block w-32 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border"
            />
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Design & Mockups</h4>
          {printAreas.map(area => (
            <div key={area.position} className="space-y-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-700">
              <span className="text-xs font-semibold uppercase text-gray-500">{area.position} Area</span>
              
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Design URL</label>
                <input
                  type="text"
                  value={item[`design_url_${area.position}`] || ''}
                  onChange={(e) => update({ [`design_url_${area.position}`]: e.target.value })}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-xs p-2 border"
                  placeholder="https://example.com/design.png"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Mockup URL (Optional)</label>
                <input
                  type="text"
                  value={item[`mockup_url_${area.position}`] || ''}
                  onChange={(e) => update({ [`mockup_url_${area.position}`]: e.target.value })}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-xs p-2 border"
                  placeholder="https://example.com/mockup.png"
                />
              </div>

              {item[`design_url_${area.position}`] && (
                <div 
                  className="mt-2 border border-gray-200 dark:border-gray-600 rounded flex justify-center items-center h-24"
                  style={{ backgroundColor: item.selectedColor || 'transparent' }}
                >
                  <img 
                    src={item[`design_url_${area.position}`]} 
                    alt={`Design ${area.position}`} 
                    className="max-h-full max-w-full object-contain"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ItemsStep = () => {
  const { orderData, addItem, removeItem, nextStep } = useOrder();

  const handleNext = () => {
    // Validate required fields for all items
    for (const item of orderData.items) {
      if (!item.selectedProductShortCode || !item.selectedPartnerId || !item.selectedColor || !item.selectedSize) {
        alert('Please complete Product, Partner, Color, and Size for all items.');
        return;
      }
      if (!item.design_url_front) { // At least one design
        alert('Please provide at least a front design URL for all items.');
        return;
      }
    }
    nextStep();
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Order Items
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Add products and configure designs.
        </p>
      </div>

      <div className="space-y-6">
        {orderData.items.map((item, index) => (
          <ItemEditor 
            key={item.id} 
            item={item} 
            index={index} 
            onRemove={orderData.items.length > 1 ? removeItem : null} 
          />
        ))}
      </div>

      <div className="flex justify-center mt-4">
        <button
          onClick={() => addItem()}
          className="flex items-center text-blue-600 hover:text-blue-800 font-medium py-2 px-4 rounded-lg transition-colors bg-blue-50 dark:bg-blue-900/20"
        >
          <Plus size={18} className="mr-2" /> Add Another Item
        </button>
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700 mt-6">
        <button
          onClick={handleNext}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Next: Shipping Info
        </button>
      </div>
    </div>
  );
};

export default ItemsStep;
