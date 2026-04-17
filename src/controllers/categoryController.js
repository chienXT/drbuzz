'use strict';

const Category = require('../models/Category');

/** GET /api/categories */
const list = async (req, res, next) => {
  try {
    const target = String(req.query.target || '').trim();
    const filter = {};
    if (target === 'blog' || target === 'video') filter.target = target;
    const cats = await Category.find(filter).sort({ name: 1 });
    res.json({ success: true, categories: cats });
  } catch (err) { next(err); }
};

/** GET /api/categories/:id */
const detail = async (req, res, next) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ success: false, message: 'Không tìm thấy category' });
    res.json({ success: true, category: cat });
  } catch (err) { next(err); }
};

/** POST /api/categories  (admin) */
const create = async (req, res, next) => {
  try {
    const { name, color, icon, target } = req.body;
    const cat = await Category.create({
      name,
      target: target === 'video' ? 'video' : 'blog',
      color: color || '#e5e7eb',
      icon: icon || '📂'
    });
    res.status(201).json({ success: true, category: cat });
  } catch (err) { next(err); }
};

/** PUT /api/categories/:id  (admin) */
const update = async (req, res, next) => {
  try {
    const { name, color, icon, target } = req.body;
    const cat = await Category.findByIdAndUpdate(
      req.params.id,
      {
        ...(name && { name }),
        ...(color && { color }),
        ...(icon && { icon }),
        ...(target && (target === 'blog' || target === 'video') && { target }),
      },
      { new: true, runValidators: true }
    );
    if (!cat) return res.status(404).json({ success: false, message: 'Không tìm thấy category' });
    res.json({ success: true, category: cat });
  } catch (err) { next(err); }
};

/** DELETE /api/categories/:id  (admin) */
const remove = async (req, res, next) => {
  try {
    const cat = await Category.findByIdAndDelete(req.params.id);
    if (!cat) return res.status(404).json({ success: false, message: 'Không tìm thấy category' });
    res.json({ success: true, message: 'Đã xóa category' });
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, update, remove };
