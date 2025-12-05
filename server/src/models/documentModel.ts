import mongoose from 'mongoose';

export enum DocumentRole {
    OWNER = 'owner',
    EDITOR = 'editor',
    VIEWER = 'viewer',
    GUEST = 'guest'
}

const documentSchema = new mongoose.Schema({
    _id: String,
    name: String,
    data: Object,
    ownerId: {
        type: String,
        required: true
    },
    permissions: {
        type: Map,
        of: String,
        default: new Map()
    }
});

export const Document = mongoose.model("document", documentSchema);
