/**
 * jquery-match-height master by @liabru
 * http://brm.io/jquery-match-height/
 * License: MIT
 */

;(function(factory) {
    'use strict';
    if (typeof define === 'function' && define.amd) {
        define(['jquery'], factory);
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(require('jquery'));
    } else {
        factory(jQuery);
    }
})(function($) {
    // Cache frequently used jQuery objects
    const $window = $(window);
    const $html = $('html');
    
    // Internal state
    let _previousResizeWidth = -1;
    let _updateTimeout = -1;
    const DISPLAY_VALUES = new Set(['inline-block', 'flex', 'inline-flex']);

    /**
     * Parse value and convert NaN to 0
     */
    const _parse = (value) => parseFloat(value) || 0;

    /**
     * Group elements by their top position (rows)
     */
    const _rows = (elements) => {
        const $elements = $(elements);
        const rows = [];
        let lastTop = null;
        const tolerance = 1;

        $elements.each(function() {
            const $el = $(this);
            const top = $el.offset().top - _parse($el.css('margin-top'));
            
            if (lastTop === null || Math.floor(Math.abs(lastTop - top)) > tolerance) {
                rows.push($($el));
            } else {
                rows[rows.length - 1] = rows[rows.length - 1].add($el);
            }
            
            lastTop = top;
        });

        return rows;
    };

    /**
     * Parse plugin options
     */
    const _parseOptions = (options) => {
        const defaults = {
            byRow: true,
            property: 'height',
            target: null,
            remove: false
        };

        if (!options) return defaults;
        
        if (typeof options === 'object') {
            return Object.assign({}, defaults, options);
        }

        if (typeof options === 'boolean') {
            return Object.assign({}, defaults, { byRow: options });
        }
        
        if (options === 'remove') {
            return Object.assign({}, defaults, { remove: true });
        }

        return defaults;
    };

    /**
     * Main plugin function
     */
    const matchHeight = $.fn.matchHeight = function(options) {
        const opts = _parseOptions(options);

        // Handle remove operation
        if (opts.remove) {
            this.css(opts.property, '');
            
            // Remove elements from all groups
            const $this = this;
            matchHeight._groups = matchHeight._groups
                .map(group => ({
                    ...group,
                    elements: group.elements.not($this)
                }))
                .filter(group => group.elements.length > 0);
            
            return this;
        }

        if (this.length <= 1 && !opts.target) {
            return this;
        }

        // Store group for later updates
        matchHeight._groups.push({
            elements: this,
            options: opts
        });

        // Apply match height
        matchHeight._apply(this, opts);

        return this;
    };

    // Plugin global properties
    Object.assign(matchHeight, {
        version: 'master',
        _groups: [],
        _throttle: 80,
        _maintainScroll: false,
        _beforeUpdate: null,
        _afterUpdate: null,
        _rows,
        _parse,
        _parseOptions
    });

    /**
     * Apply matchHeight to given elements
     */
    matchHeight._apply = function(elements, options) {
        const opts = _parseOptions(options);
        const $elements = $(elements);
        
        if (!$elements.length) return this;

        // Store scroll position if needed
        const scrollTop = matchHeight._maintainScroll ? $window.scrollTop() : 0;
        const htmlHeight = matchHeight._maintainScroll ? $html.outerHeight(true) : 0;

        // Handle hidden parents
        const $hiddenParents = $elements.parents().filter(':hidden');
        const hiddenStyles = $hiddenParents.map((i, el) => {
            const $el = $(el);
            return {
                $el,
                style: $el.attr('style')
            };
        }).get();
        
        $hiddenParents.css('display', 'block');

        // Get rows or use single group
        let rows = [$elements];
        if (opts.byRow && !opts.target) {
            // Temporarily set equal height for row calculation
            $elements.each(function() {
                const $el = $(this);
                $el.data('style-cache', $el.attr('style'));
                
                let display = $el.css('display');
                if (!DISPLAY_VALUES.has(display)) {
                    display = 'block';
                }
                
                $el.css({
                    display,
                    paddingTop: 0,
                    paddingBottom: 0,
                    marginTop: 0,
                    marginBottom: 0,
                    borderTopWidth: 0,
                    borderBottomWidth: 0,
                    height: '100px',
                    overflow: 'hidden'
                });
            });

            rows = _rows($elements);
            
            // Restore original styles
            $elements.each(function() {
                const $el = $(this);
                $el.attr('style', $el.data('style-cache') || '');
            });
        }

        // Process each row
        rows.forEach($row => {
            if (opts.byRow && !opts.target && $row.length <= 1) {
                $row.css(opts.property, '');
                return;
            }

            // Calculate target height
            let targetHeight = 0;
            
            if (!opts.target) {
                $row.each(function() {
                    const $el = $(this);
                    const originalStyle = $el.attr('style');
                    let display = $el.css('display');
                    
                    if (!DISPLAY_VALUES.has(display)) {
                        display = 'block';
                    }
                    
                    // Get natural height
                    $el.css({ display, [opts.property]: '' });
                    const height = $el.outerHeight(false);
                    
                    if (height > targetHeight) {
                        targetHeight = height;
                    }
                    
                    // Restore style
                    $el.attr('style', originalStyle || '');
                });
            } else {
                targetHeight = opts.target.outerHeight(false);
            }

            // Apply height to elements
            $row.each(function() {
                const $el = $(this);
                
                if (opts.target && $el.is(opts.target)) {
                    return;
                }

                let verticalPadding = 0;
                if ($el.css('box-sizing') !== 'border-box') {
                    verticalPadding += _parse($el.css('border-top-width')) + 
                                      _parse($el.css('border-bottom-width')) +
                                      _parse($el.css('padding-top')) + 
                                      _parse($el.css('padding-bottom'));
                }

                $el.css(opts.property, `${targetHeight - verticalPadding}px`);
            });
        });

        // Restore hidden parents
        hiddenStyles.forEach(({ $el, style }) => {
            $el.attr('style', style || null);
        });

        // Restore scroll position if needed
        if (matchHeight._maintainScroll) {
            $window.scrollTop((scrollTop / htmlHeight) * $html.outerHeight(true));
        }

        return this;
    };

    /**
     * Apply to elements with data attributes
     */
    matchHeight._applyDataApi = function() {
        const groups = new Map();

        $('[data-match-height], [data-mh]').each(function() {
            const $el = $(this);
            const groupId = $el.attr('data-mh') || $el.attr('data-match-height');
            
            if (groups.has(groupId)) {
                groups.set(groupId, groups.get(groupId).add($el));
            } else {
                groups.set(groupId, $el);
            }
        });

        groups.forEach($group => {
            $group.matchHeight(true);
        });
    };

    /**
     * Update all groups
     */
    const _update = (event) => {
        matchHeight._beforeUpdate?.(event, matchHeight._groups);
        
        matchHeight._groups.forEach(({ elements, options }) => {
            matchHeight._apply(elements, options);
        });
        
        matchHeight._afterUpdate?.(event, matchHeight._groups);
    };

    matchHeight._update = function(throttle, event) {
        // Prevent unnecessary resize updates
        if (event?.type === 'resize') {
            const windowWidth = $window.width();
            if (windowWidth === _previousResizeWidth) return;
            _previousResizeWidth = windowWidth;
        }

        // Throttle updates
        if (!throttle) {
            _update(event);
        } else if (_updateTimeout === -1) {
            _updateTimeout = setTimeout(() => {
                _update(event);
                _updateTimeout = -1;
            }, matchHeight._throttle);
        }
    };

    // Bind events
    $(matchHeight._applyDataApi);

    const eventMethod = $.fn.on ? 'on' : 'bind';
    
    $window[eventMethod]('load', (event) => {
        matchHeight._update(false, event);
    });

    $window[eventMethod]('resize orientationchange', (event) => {
        matchHeight._update(true, event);
    });
});