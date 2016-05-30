'use strict'

if (!NGN) {
  console.error('NGN not found.')
} else {
  window.NGNX = window.NGNX || {}

  /**
   * @class NGNX.Driver
   * Drivers can be used to easily reference & direct communication between
   * components of an application, such as data stores or DOM elements.
   *
   * NGN is based on the concept of a service bus (NGN.BUS), so the NGNX concept
   * of a driver differs from a tradtional MVC approach in subtle ways.
   * The biggest difference is a driver is designed to trigger events on the
   * global event bus. It also listens to the global event bus, responding
   * only to a selection of events it cares about.
   *
   * NGNX.Driver is designed to simplify event triggering and isolate
   * application logic in an opinionated way (keep it brutally simple). See the
   * options associated with each configuration property for specific details.
   *
   * This class was designed to be extended, acting primarily as a standard way
   * to trigger scoped events. It can be extended with any level of logic by adding
   * custom methods, properties, configurations, etc. For more details about
   * extending drivers, see the NGNX.Driver guide.
   */
  class _Driver {
    constructor (cfg) {
      cfg = cfg || {}

      Object.defineProperties(this, {
        /**
         * @cfg {string} [scope]
         * The scope is prepended to NGN.BUS events. For example, setting
         * this to `mydriver.` will trigger events like
         * `mydriver.eventname` instead of just `eventname`.
         */
        scope: NGN.define(true, false, false, cfg.scope || null),

        /**
         * @cfg {Object} [references]
         * An object of key/values depicting a reference. Each key is the
         * reference name, while each value is a DOM selector pattern. Providing
         * references here is the same as writing `NGN.ref.create('key',
         * 'selector/value')` for each reference (this is a shortcut method).
         * Additionally, these references are associated with the driver for
         * easy access.
         *
         * A reference can be accessed in one of two ways:
         *
         * 1. NGN.ref.key
         * 1. Driver.ref.key or Driver.dom.key
         *
         * ```js
         * let Driver = new NGNX.Driver({
         *   references: {
         *   	 buttons: 'body > button',
         *   	 nav: 'body > header > nav:first-of-type',
         *   	 input: '#myinput'
         *   }
         * })
         *
         * NGN.ref.buttons.forward('click', NGN.BUS.attach('some.event'))
         * // same as
         * Driver.ref.buttons.forward('click', NGN.BUS.attach('some.event'))
         * // same as
         * Driver.dom.buttons.forward('click', NGN.BUS.attach('some.event'))
         * // same as
         * Driver.dom.buttons.addEventListener('click', function (e) {
         *   NGN.BUS.emit('some.event', e)
         * })
         * ```
         *
         * References are global. If a reference already exists, it will **not**
         * be overridden. Instead, a `getter`/pointer to the original reference
         * will be created and a warning will be displayed in the console.
         */
        references: NGN.define(false, false, false, cfg.references || {}),

        /**
         * @cfgproperty {Object} [stores]
         * An object of NGN.DATA.Store references to associate with the driver.
         *
         * ```js
         * let MyStore = new NGN.DATA.Store({
         *   model: MyModel,
         *   allowDuplicates: false
         * })
         *
         * let MyOtherStore = new NGN.DATA.Store({
         *   model: MyOtherModel,
         *   allowDuplicates: false
         * })
         *
         * let Driver = new NGNX.Driver({
         *   datastores: {
         *   	 a: MyStore,
         *   	 b: MyOtherStore
         *   }
         * })
         *
         * console.log(Driver.store.a.records) // dumps the records for MyModel
         * console.log(Driver.store.b.records) // dumps the records for MyOtherModel
         * ```
         * Setting store references will also trigger specially scoped events,
         * making it simpler to pinpoint modifications to a specific store.
         * See #scopeStoreEvents for details.
         * @type {Object}
         */
        datastores: NGN.define(true, false, false, cfg.stores || {}),

        /**
         * @property {Array} events
         * Contains a list of events that can be triggered by this driver.
         * @private
         */
        events: NGN.define(false, true, false, []),

        /**
         * @cfg {Object} templates
         * A named reference to NGN.HTTP templates. For example:
         *
         * ```js
         * let Driver = new NGNX.Driver({
         *   templates: {
         *     myview: './views/templates/myview.html',
         *     other: './views/templates/other.html'
         *   }
         * })
         *
         * // Apply the template to the DOM
         * Driver.render('myview', data, function (element) {
         *   document.appendChild(element)
         * })
         *
         * // Alternative way to apply the template to the DOM
         * Driver.render('myview', data, document)
         * Driver.render('myview', data, document, 'beforeEnd')
         * ```
         *
         * The last few lines of code are the equivalent of:
         *
         * ```js
         * NGN.HTTP.template('./views/templates/myview.html', data, function (el) {
         *   document.appendChild(el)
         * })
         * ```
         * The primary advantage is code simplicity/organization. It is possible
         * to define the same template in multiple Drivers, but they will always
         * reference the same template file because it is all handled by NGN.
         * This means all caching is handled automatically, regardless of which
         * Driver initiates the download. It also allows different drivers to
         * handle the response in a different manner.
         */
        templates: NGN.define(false, false, false, cfg.templates || {}),

        /**
         * @property {Array} dataevents
         * The supported data events.
         * @hidden
         */
        dataevents: NGN.define(false, false, false, [
          'record.create',
          'record.delete',
          'index.create',
          'index.delete',
          'record.duplicate',
          'record.update',
          'filter.create',
          'filter.remove'
        ])
      })

      let me = this

      // Generate references
      Object.keys(this.references).forEach(function (r) {
        if (NGN.ref[r] === undefined || NGN.ref[r] === null) {
          NGN.ref.create(r, me.references[r])
        }
      })

      // For each datastore, listen to the store's events and bubble the event.
      if (this.scope !== null) {
        Object.keys(this.datastores).forEach(function (name) {
          me.scopeStoreEvents(name)
        })
      }
    }

    /**
     * @method render
     * Render a referenced template.
     *
     * **Examples:**
     * ```js
     * // Add the rendered template to the document at the end.
     * Driver.render('myview', data, document, 'beforeend')
     *
     * // Add the rendered template to the document at the end.
     * // Notice the 'beforeend' is missing (it is the default).
     * Driver.render('myview', data, document)
     *
     * // Mannually Apply the template to the DOM using a callback.
     * Driver.render('myview', data, function (element) {
     *   document.appendChild(element)
     * })
     * ```
     * @param {string} name
     * The name of the template provided in #templates.
     * @param {object} data
     * The key/value object passed to the NGN.HTTP.template method.
     * @param {HTMLElement|String} [parent]
     * The parent element or a selector reference to the parent element
     * in which the template code is injected.
     * @param {string} [position=beforeend]
     * If and only if a parent object is specified, this attribute will
     * insert the template at the specified position. Valid options are
     * anything passed to [insertAdjacentHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/insertAdjacentHTML).
     * @param {function} [callback]
     * If no parent/position are provided, an optional callback can be used to
     * receive the DOM element generated by the template.
     * @param {HTMLElement} callback.element
     * The callback receives a valid HTML Element that can be modified or
     * inserted into the DOM.
     */
    render (name, data, parent, position) {
      if (!this.templates.hasOwnProperty(name)) {
        console.warn('The Driver does not have a reference to a template called \"' + name.trim() + '\".')
        return
      }
      if (typeof data !== 'object') {
        console.warn('The data provided to the renderer could not be processed because it is not a key/value object.', data)
        return
      }
      // If the parent is a function, treat it asa callback
      if (typeof parent === 'function') {
        NGN.HTTP.template(this.templates[name], data, parent)
        return
      }
      // If the parent is a selector, reference the element.
      if (typeof parent === 'string') {
        let p = parent
        parent = document.querySelector(parent)
        if (parent === null) {
          console.warn(p + ' is not a valid selector or the referenced parent DOM element could not be found.')
          return
        }
      }
      position = (position || 'beforeend').toLowerCase()
      let me = this
      NGN.HTTP.template(this.templates[name], data, function (element) {
        if (NGN.hasOwnProperty('DOM')) {
          NGN.DOM.svg.update(element, function () {
            me.adjustedRender(parent, element, position)
          })
        } else {
          me.adjustedRender(parent, element, position)
        }
      })
    }

    adjustedRender (parent, element, position) {
      if (['beforebegin', 'afterbegin', 'afterend'].indexOf(position.trim().toLowerCase()) < 0) {
        parent.appendChild(element)
        NGN.BUS.emit(this.scope + 'template.render', element)
        NGN.BUS.emit('template.render', element)
      } else {
        parent.insertAdjacentHTML(position, element.outerHTML)
        switch (position) {
          case 'beforebegin':
            NGN.BUS.emit(this.scope + 'template.render', parent.previousSibling)
            return NGN.BUS.emit('template.render', parent.previousSibling)
          case 'afterend':
            NGN.BUS.emit(this.scope + 'template.render', parent.nextSibling)
            return NGN.BUS.emit('template.render', parent.nextSibling)
          case 'afterbegin':
            NGN.BUS.emit(this.scope + 'template.render', parent.firstChild)
            return NGN.BUS.emit('template.render', parent.firstChild)
          default:
            NGN.BUS.emit(this.scope + 'template.render', parent.lastChild)
            return NGN.BUS.emit('template.render', parent.lastChild)
        }
      }
    }

    /**
     * @method addStore
     * Add a new datastore reference to the driver.
     *
     * **Example:**
     *
     * ```js
     * let MyStore = new NGN.DATA.Store({...})
     * let MyDriver = new NGNX.Driver({
     *   ...
     * })
     *
     * MyDriver.addStore('mystore', MyStore)
     *
     * console.log(MyDriver.store.mystore.records) // dumps the records
     * ```
     * @param {String} referenceName
     * The name by which the datastore can be retrieved.
     * @param {NGN.DATA.Store} store
     * The store to reference.
     */
    addStore (name, store) {
      let me = this
      if (this.datastores.hasOwnProperty(name)) {
        if (this.scope !== null) {
          // Remove scoped events.
          this.dataevents.forEach(function (e) {
            NGN.BUS.off(me.scope + e)
          })
        }
        console.warn('Driver already had a reference to ' + name + ', which has been overwritten.')
      }
      this.datastores[name] = store
      this.scopeStoreEvents(name)
    }

    /**
     * @method scopeStoreEvents
     * Apply the #scope prefix to each datastore event. In addition to
     * prefixing with the scope, a separate event will be prefixed with both
     * the scope and name of the store reference. This is a convenience event.
     *
     * For example:
     *
     * ```js
     * let MyStore = new NGN.DATA.Store({
     *   model: MyModel,
     *   allowDuplicates: false
     * })
     *
     * let MyOtherStore = new NGN.DATA.Store({
     *   model: MyOtherModel,
     *   allowDuplicates: false
     * })
     *
     * let Driver = new NGNX.Driver({
     *   scope: 'myscope.', // <--- Notice the Driver scope!
     *   datastores: {
     *   	 a: MyStore, // <-- "a" is the store reference name for MyStore
     *   	 b: MyOtherStore // <-- "b" is the store reference name for MyOtherStore
     *   }
     * })
     *
     * // Listen for record creation on ALL stores the Driver references.
     * // In this case, adding a record to `MyStore` (a) or `MyOtherStore` (b)
     * // will both trigger this event handler.
     * NGN.BUS.on('myscope.record.create', function (record) {
     *   console.log(record.data)
     * })
     *
     * // Listen for record creation ONLY ON `MyStore`. Notice the event pattern:
     * // `{scope}.{storeReferenceName}.record.create`.
     * NGN.BUS.on('myscope.a.record.create', funciton (record) {
     *   console.log(record.data)
     * })
     * ```
     *
     * If you use an alternative delimiter/separator to define your events, the
     * Driver will recognize common ones, including a space, `-`, `.`, `_`, `+`,
     * ':', or `;`.
     * @param {String} name
     * The Driver reference name to the store.
     * @param {boolean} suppressWarning
     * Suppress the warning message if the scope is not defined.
     * @private
     */
    scopeStoreEvents (name, suppress) {
      suppress = NGN.coalesce(suppress, false)
      if (this.scope !== null) {
        let me = this
        this.dataevents.forEach(function (e) {
          me.datastores[name].on(e, function (model) {
            NGN.BUS.emit(me.scope + e, model)
            if ([' ', '-', '.', '_', '+', ':'].indexOf(me.scope.substr(me.scope.length - 1, 1)) >= 0) {
              let sep = me.scope.substr(me.scope.length - 1, 1)
              NGN.BUS.emit(me.scope + name + sep + e, model)
            } else {
              NGN.BUS.emit(me.scope + name + e, model)
            }
          })
        })
      } else if (!suppress) {
        console.warn('Driver.scopeStoreEvents called without a defined scope.')
      }
    }

    /**
     * @property {Object} store
     * Returns the #datastores associated with the Driver.
     */
    get store () {
      return this.datastores
    }

    /**
     * @property {NGN.ref} ref
     * Returns a DOM reference.
     */
    get ref () {
      return NGN.ref
    }

    /**
     * @property {NGN.ref} dom
     * Returns a DOM reference. This is a shortcut to #ref.
     */
    get dom () {
      return this.ref
    }

    /**
     * @method on
     * Create an event handler
     * @param {string} eventName
     * Name of the event to handle.
     * @param {function} handler
     * The handler function that responds to the event.
     */
    on (topic, handler) {
      if (!NGN.BUS) {
        console.warn("NGNX.Driver.on('" + topic + "', ...) will not work because NGN.BUS is not available.")
        return
      }
      if (this.events.indexOf(topic) >= 0) {
        NGN.BUS.on(topic, handler)
      } else {
        console.warn(topic + ' is not a supported event for this Driver.')
      }
    }

    /**
     * @method pool
     * A shortcut method to create an NGN.BUS.pool. This method will automatically
     * apply the #scope prefix to the pool. It is possible to create multiple pools
     * by using an "extra" scope.
     *
     * **Example**
     * ```js
     * let MyDriver = new NGNX.Driver({
     *   scope: 'myprefix.'
     * })
     *
     * MyDriver.pool('extra.', {
     *   demo: function () {
     *     ...
     *   }
     * })
     *
     * // The above is equivalent to:
     *
     * NGN.BUS.pool('myprefix.extra.', {
     *   demo: function () { ... }
     * })
     * ```
     *
     * If "extra" scope isn't necessary, it will still apply the #scope to events
     * in order to associate the events with this store.
     *
     * ```js
     * let MyDriver = new NGNX.Driver({
     *   scope: 'myprefix.'
     * })
     *
     * MyDriver.pool({
     * 	 demo: function () {...}
     * })
     *
     * // The above is equivalent to:
     *
     * NGN.BUS.pool('myprefix.', {
     *   demo: function () { ... }
     * })
     * ```
     *
     * While this is a simple abstraction, it offers a code organization benefit.
     * Drivers can encapsulate BUS event logic in one place using a driver.
     * @param {string} [extrascope]
     * An extra scope to add to event listeners.
     * @param {object} handlers
     * An object containing event listeners. See NGN.BUS.pool for syntax and
     * examples.
     */
    pool (extra, data) {
      if (typeof extra === 'object') {
        data = extra
        extra = ''
      }
      let scope = (this.scope + extra).trim()
      scope = scope.length > 0 ? scope : null
      NGN.BUS.pool(scope, data)
    }

    /**
     * @method emit
     * This is a shortcut to NGN.BUS.emit, but it adds the #scope to the event.
     *
     * **Example**:
     * ```js
     * let MyDriver = new NGNX.Driver({
     *   scope: 'myprefix.'
     * })
     *
     * MyDriver.emit('some.event') // <--- Emit event
     * ```
     * The last line where the event is emitted will actually send an event
     * called `prefix.some.event` to the NGN BUS. In other words, the last line
     * is the equivalent of running:
     *
     * ```js
     * NGN.BUS.emit('prefix.some.event')
     * ```
     *
     * The "value-add" of this method is prepending the scope automatically.
     * It also supports payloads (just like NGN.BUS.emit).
     * @param {string} eventName
     * The name of the event to trigger (with the #scope prefixed to it).
     * @param {object|string|number|boolean|array} payload
     * An object to send to the event handler.
     */
    emit (eventName, payload) {
      NGN.BUS.emit(this.scope + eventName, payload)
    }
  }
  NGNX.Driver = _Driver
}
