import { DB, uid } from './db.js';
import { placeholderImg } from './placeholder.js';

export const STATUS_FLOW = [
  { key: 'waiting_design', label: 'Waiting Design', icon: '⏳' },
  { key: 'check_design', label: 'Check Design', icon: '✅' },
  { key: 'fix_design_1', label: 'Fix Design 1', icon: '✏️' },
  { key: 'fix_design_2', label: 'Fix Design 2', icon: '✏️' },
  { key: 'support_customer', label: 'Support Customer', icon: '💬' },
  { key: 'done', label: 'Done', icon: '✔️' },
];

export const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

const now = Date.now();
const day = 86400000;

async function seedIfEmpty() {
  const [sellers, designers, colors, designs] = await Promise.all([
    DB.getAll('sellers'),
    DB.getAll('designers'),
    DB.getAll('colors'),
    DB.getAll('designs'),
  ]);

  if (sellers.length === 0) {
    const defaults = [
      { name: 'John Smith', email: 'john.smith@example.com', phone: '090-123-4567' },
      { name: 'Emily Tran', email: 'emily.tran@example.com', phone: '090-222-3344' },
      { name: 'Michael Nguyen', email: 'michael.nguyen@example.com', phone: '090-555-8899' },
    ];
    for (const d of defaults) await DB.put('sellers', { id: uid('seller'), ...d });
  }

  if (designers.length === 0) {
    const defaults = [
      { name: 'Alex Designer', email: 'alex.designer@example.com' },
      { name: 'Linh Pham', email: 'linh.pham@example.com' },
    ];
    for (const d of defaults) await DB.put('designers', { id: uid('designer'), ...d });
  }

  if (colors.length === 0) {
    const defaults = [
      { name: 'Sunset Orange', hex: '#FF7A59' },
      { name: 'Mango Yellow', hex: '#FFB84D' },
      { name: 'Lagoon Teal', hex: '#22B2B2' },
      { name: 'Deep Navy', hex: '#0D3B66' },
      { name: 'Pure White', hex: '#FFFFFF' },
      { name: 'Ash Grey', hex: '#F4F4F4' },
      { name: 'Classic Black', hex: '#111111' },
      { name: 'Cherry Red', hex: '#D9483F' },
    ];
    for (const d of defaults) await DB.put('colors', { id: uid('color'), ...d });
  }

  if (designs.length === 0) {
    const sellerList = await DB.getAll('sellers');
    const designerList = await DB.getAll('designers');
    const seller = (n) => sellerList.find((s) => s.name === n) || sellerList[0];
    const designer = (n) => designerList.find((d) => d.name === n) || designerList[0];

    const samples = [
      {
        name: 'Summer Vibes', product: 'T-Shirt', gender: 'Unisex', size: 'L', colorName: 'White',
        sellerName: 'John Smith', designerName: 'Alex Designer', status: 'waiting_design', priority: 'Normal',
        createdAt: now - 5 * day, dueDate: now - 3 * day,
        sellerNotes: 'Please follow the mockup style.\nFonts can be adjusted to look better.\nMake colors vibrant and summer vibes!',
        colorRefs: ['#FFB84D', '#FF7A59', '#22B2B2', '#0D3B66', '#FFFFFF', '#F4F4F4'],
        mockups: [
          { id: uid('mk'), label: 'Front', dataUrl: placeholderImg('Summer Vibes', { bg: '#fdf1e6', fg: '#d98f1e' }) },
          { id: uid('mk'), label: 'Back', dataUrl: placeholderImg('Back', { bg: '#f4f4f4', fg: '#999' }) },
          { id: uid('mk'), label: 'Close-up', dataUrl: placeholderImg('Close-up', { bg: '#e6f0fd', fg: '#2f6fed' }) },
          { id: uid('mk'), label: 'Lifestyle', dataUrl: placeholderImg('Lifestyle', { bg: '#eef7ee', fg: '#2e9e6d' }) },
        ],
      },
      {
        name: 'Retro Surf Club', product: 'Hoodie', gender: 'Men', size: 'XL', colorName: 'Black',
        sellerName: 'Emily Tran', designerName: 'Linh Pham', status: 'check_design', priority: 'High',
        createdAt: now - 4 * day, dueDate: now - 1 * day,
        sellerNotes: 'Keep the retro sunset palette. Check spacing on the back print.',
        colorRefs: ['#111111', '#FF7A59', '#FFB84D'],
        mockups: [{ id: uid('mk'), label: 'Front', dataUrl: placeholderImg('Retro Surf', { bg: '#111', fg: '#FFB84D' }) }],
      },
      {
        name: 'Mountain Trail Co.', product: 'T-Shirt', gender: 'Unisex', size: 'M', colorName: 'Forest Green',
        sellerName: 'Michael Nguyen', designerName: 'Alex Designer', status: 'fix_design_1', priority: 'Normal',
        createdAt: now - 6 * day, dueDate: now - 2 * day,
        sellerNotes: 'Customer asked for thicker outline on the mountain icon.',
        colorRefs: ['#22B2B2', '#0D3B66'],
        mockups: [{ id: uid('mk'), label: 'Front', dataUrl: placeholderImg('Mountain', { bg: '#e7f7ef', fg: '#2e9e6d' }) }],
      },
      {
        name: 'Coffee Lovers Club', product: 'Mug', gender: '-', size: '11oz', colorName: 'White',
        sellerName: 'John Smith', designerName: 'Linh Pham', status: 'fix_design_2', priority: 'Urgent',
        createdAt: now - 3 * day, dueDate: now,
        sellerNotes: 'Second round: customer wants the quote font changed to handwritten style.',
        colorRefs: ['#6d5bd0', '#FFFFFF'],
        mockups: [{ id: uid('mk'), label: 'Front', dataUrl: placeholderImg('Coffee', { bg: '#efeafc', fg: '#5a49b8' }) }],
      },
      {
        name: 'Little Explorer', product: 'Kids Tee', gender: 'Kids', size: '6-7Y', colorName: 'Sky Blue',
        sellerName: 'Emily Tran', designerName: 'Alex Designer', status: 'support_customer', priority: 'Normal',
        createdAt: now - 7 * day, dueDate: now - 4 * day,
        sellerNotes: 'Customer has a question about print placement, waiting on their reply.',
        colorRefs: ['#22B2B2', '#FFB84D'],
        mockups: [{ id: uid('mk'), label: 'Front', dataUrl: placeholderImg('Explorer', { bg: '#e6f0fd', fg: '#2f6fed' }) }],
      },
      {
        name: 'Vintage Motor Garage', product: 'T-Shirt', gender: 'Men', size: 'L', colorName: 'Charcoal',
        sellerName: 'Michael Nguyen', designerName: 'Linh Pham', status: 'done', priority: 'Low',
        createdAt: now - 12 * day, dueDate: now - 9 * day,
        sellerNotes: 'Approved, looks great!',
        colorRefs: ['#111111', '#D9483F'],
        mockups: [{ id: uid('mk'), label: 'Front', dataUrl: placeholderImg('Motor Garage', { bg: '#fdeceb', fg: '#d9483f' }) }],
      },
    ];

    for (const s of samples) {
      await DB.put('designs', {
        id: uid('design'),
        name: s.name,
        product: s.product,
        gender: s.gender,
        size: s.size,
        colorName: s.colorName,
        sellerId: seller(s.sellerName).id,
        designerId: designer(s.designerName).id,
        createdAt: s.createdAt,
        dueDate: s.dueDate,
        status: s.status,
        priority: s.priority,
        sellerNotes: s.sellerNotes,
        designerNotes: '',
        colorRefs: s.colorRefs,
        mockups: s.mockups,
        designFiles: [],
        history: [{ ts: s.createdAt, text: 'Task created by seller.' }],
      });
    }
  }
}

export { seedIfEmpty };
