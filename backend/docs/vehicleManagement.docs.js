/**
 * @swagger
 * tags:
 *   - name: Vehicle Management
 *     description: Manager vehicle group and vehicle lifecycle management
 */

/**
 * @swagger
 * /api/admin/vehicle-groups:
 *   get:
 *     tags: [Vehicle Management]
 *     summary: List vehicle groups
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Vehicle group list
 *   post:
 *     tags: [Vehicle Management]
 *     summary: Create a vehicle group
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, price_per_km]
 *             properties:
 *               name: { type: string, example: 1T25 }
 *               description: { type: string, nullable: true }
 *               max_load_weight_kg: { type: number, nullable: true, example: 1250 }
 *               price_per_km: { type: number, example: 18000 }
 *               upgrade_allowed: { type: boolean, example: true }
 *     responses:
 *       201:
 *         description: Vehicle group created
 */

/**
 * @swagger
 * /api/admin/vehicle-groups/{id}:
 *   get:
 *     tags: [Vehicle Management]
 *     summary: Get vehicle group detail
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Vehicle group detail
 *       404:
 *         description: Vehicle group not found
 *   put:
 *     tags: [Vehicle Management]
 *     summary: Update vehicle group
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, price_per_km]
 *             properties:
 *               name: { type: string }
 *               description: { type: string, nullable: true }
 *               max_load_weight_kg: { type: number, nullable: true }
 *               price_per_km: { type: number }
 *               upgrade_allowed: { type: boolean }
 *     responses:
 *       200:
 *         description: Vehicle group updated
 *   delete:
 *     tags: [Vehicle Management]
 *     summary: Hide vehicle group from active lists
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Vehicle group hidden
 *       409:
 *         description: Vehicle group cannot be hidden
 */

/**
 * @swagger
 * /api/admin/vehicles:
 *   get:
 *     tags: [Vehicle Management]
 *     summary: List vehicles with pagination and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, maintenance, broken, retired]
 *       - in: query
 *         name: vehicle_group_id
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Vehicle list
 *   post:
 *     tags: [Vehicle Management]
 *     summary: Create vehicle
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plate_number, vehicle_group_id]
 *             properties:
 *               plate_number: { type: string, example: 51H-12345 }
 *               vehicle_group_id: { type: integer, example: 100000 }
 *               brand: { type: string, nullable: true }
 *               model: { type: string, nullable: true }
 *               load_capacity_kg: { type: number, nullable: true }
 *               manufacture_year: { type: integer, nullable: true }
 *               purchase_date: { type: string, format: date, nullable: true }
 *               assigned_driver_id: { type: integer, nullable: true }
 *               status:
 *                 type: string
 *                 enum: [active]
 *     responses:
 *       201:
 *         description: Vehicle created
 */

/**
 * @swagger
 * /api/admin/vehicles/driver-options:
 *   get:
 *     tags: [Vehicle Management]
 *     summary: List drivers available for vehicle assignment and maintenance selection
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: vehicle_id
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Driver options with current assignment info, active shipment flags, and maintenance eligibility
 */

/**
 * @swagger
 * /api/admin/vehicles/{id}:
 *   get:
 *     tags: [Vehicle Management]
 *     summary: Get vehicle detail
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Vehicle detail
 *       404:
 *         description: Vehicle not found
 *   put:
 *     tags: [Vehicle Management]
 *     summary: Update vehicle master data
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plate_number, vehicle_group_id]
 *             properties:
 *               plate_number: { type: string }
 *               vehicle_group_id: { type: integer }
 *               brand: { type: string, nullable: true }
 *               model: { type: string, nullable: true }
 *               load_capacity_kg: { type: number, nullable: true }
 *               manufacture_year: { type: integer, nullable: true }
 *               purchase_date: { type: string, format: date, nullable: true }
 *               assigned_driver_id: { type: integer, nullable: true }
 *     responses:
 *       200:
 *         description: Vehicle updated
 *   delete:
 *     tags: [Vehicle Management]
 *     summary: Compatibility alias for retiring a vehicle
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Vehicle retired
 */

/**
 * @swagger
 * /api/admin/vehicles/{id}/send-to-maintenance:
 *   post:
 *     tags: [Vehicle Management]
 *     summary: Create maintenance record and move active or broken vehicle to maintenance
 *     security:
 *       - bearerAuth: []
 * /api/admin/vehicles/{id}/verify-maintenance:
 *   post:
 *     tags: [Vehicle Management]
 *     summary: Verify completed maintenance and move vehicle to active
 *     security:
 *       - bearerAuth: []
 * /api/admin/vehicles/{id}/mark-broken:
 *   post:
 *     tags: [Vehicle Management]
 *     summary: Create vehicle breakdown incident and move vehicle to broken
 *     security:
 *       - bearerAuth: []
 * /api/admin/vehicles/{id}/restore:
 *   post:
 *     tags: [Vehicle Management]
 *     summary: Resolve vehicle breakdown incident and move vehicle to active
 *     security:
 *       - bearerAuth: []
 * /api/admin/vehicles/{id}/retire:
 *   post:
 *     tags: [Vehicle Management]
 *     summary: Retire vehicle permanently from future operations
 *     security:
 *       - bearerAuth: []
 */

/**
 * @swagger
 * /api/admin/vehicles/{id}/status:
 *   patch:
 *     tags: [Vehicle Management]
 *     summary: Compatibility endpoint that maps valid status transitions to lifecycle actions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, maintenance, broken, retired]
 *     responses:
 *       200:
 *         description: Lifecycle action applied
 *       409:
 *         description: Invalid transition
 */

/**
 * @swagger
 * /api/admin/vehicles/{id}/driver-assignment:
 *   patch:
 *     tags: [Vehicle Management]
 *     summary: Assign driver to active vehicle, or unassign driver from active, maintenance, or broken vehicle
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assigned_driver_id:
 *                 type: integer
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Vehicle assignment updated
 */
