import mongoose from 'mongoose';

export enum DocumentRole {
    OWNER = 'owner',
    EDITOR = 'editor',
    VIEWER = 'viewer',
    GUEST = 'guest'
}

const documentSchema = new mongoose.Schema({
    _id: String,
    name: {
        type: String,
        index: true  // Index for regex search on document name
    },
    data: Object,
    ownerId: {
        type: String,
        required: true,
        index: true  // Index for finding documents by owner
    },
    permissions: {
        type: Map,
        of: String,
        default: new Map()
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true  // Index for sorting by creation date
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index for common query patterns: find documents by owner, sorted by date
documentSchema.index({ ownerId: 1, createdAt: -1 });

// Update the updatedAt field on save
documentSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

export const Document = mongoose.model("document", documentSchema);
