export const generatePaymentRef = () => {
  return Math.random().toString(36).substring(2, 14).toUpperCase();
};
