import React from 'react';
import { useOrder } from './OrderContext';

const Step2ShippingInfo = () => {
  const { orderData, updateShippingAddress, updateOrderData, prevStep, nextStep } = useOrder();

  const handleNext = () => {
    const { fullName, email, phone, country, state, city, street, zipcode } = orderData.shippingAddress;
    if (!fullName || !email || !phone || !country || !state || !city || !street || !zipcode) {
      alert('Please fill out all required shipping fields.');
      return;
    }
    nextStep();
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    updateShippingAddress({ [name]: value });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Shipping Information
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Where should we send this order?
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              name="fullName"
              value={orderData.shippingAddress.fullName}
              onChange={handleChange}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email *
            </label>
            <input
              type="email"
              name="email"
              value={orderData.shippingAddress.email}
              onChange={handleChange}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Phone *
            </label>
            <input
              type="tel"
              name="phone"
              value={orderData.shippingAddress.phone}
              onChange={handleChange}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Street Address *
            </label>
            <input
              type="text"
              name="street"
              value={orderData.shippingAddress.street}
              onChange={handleChange}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                City *
              </label>
              <input
                type="text"
                name="city"
                value={orderData.shippingAddress.city}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                State/Province *
              </label>
              <input
                type="text"
                name="state"
                value={orderData.shippingAddress.state}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                ZIP / Postal Code *
              </label>
              <input
                type="text"
                name="zipcode"
                value={orderData.shippingAddress.zipcode}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Country *
              </label>
              <select
                name="country"
                value={orderData.shippingAddress.country}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border"
              >
                <option value="US">United States (US)</option>
                <option value="CA">Canada (CA)</option>
                <option value="GB">United Kingdom (GB)</option>
                <option value="AU">Australia (AU)</option>
                <option value="EU">European Union (EU)</option>
                <option value="VN">Vietnam (VN)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={prevStep}
          className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 font-medium py-2 px-6 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Next: Calculate Cost
        </button>
      </div>
    </div>
  );
};

export default Step2ShippingInfo;
