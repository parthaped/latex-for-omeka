<?php
namespace LatexForOmeka;

use Laminas\EventManager\Event;
use Laminas\EventManager\SharedEventManagerInterface;
use Laminas\Mvc\Controller\AbstractController;
use Laminas\ServiceManager\ServiceLocatorInterface;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Module\AbstractModule;

/**
 * Marks the literal values that contain LaTeX so the page script can render them; the stored text is never changed.
 */
class Module extends AbstractModule
{
    const KATEX_CDN = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';

    const SETTINGS = [
        'latexforomeka_properties' => [],
        'latexforomeka_dollar_math' => false,
        'latexforomeka_katex_url' => self::KATEX_CDN,
        'latexforomeka_decode_properties' => [],
    ];

    /** @var bool */
    private $assetsAdded = false;

    public function getConfig()
    {
        return include __DIR__ . '/config/module.config.php';
    }

    public function install(ServiceLocatorInterface $services)
    {
        $settings = $services->get('Omeka\Settings');
        foreach (self::SETTINGS as $name => $default) {
            $settings->set($name, $default);
        }
    }

    public function uninstall(ServiceLocatorInterface $services)
    {
        $settings = $services->get('Omeka\Settings');
        foreach (array_keys(self::SETTINGS) as $name) {
            $settings->delete($name);
        }
    }

    public function attachListeners(SharedEventManagerInterface $sharedEventManager)
    {
        // Early (high priority), since this replaces the value's HTML and other modules may wrap it after.
        $sharedEventManager->attach(
            'Omeka\Api\Representation\ValueRepresentation',
            'rep.value.html',
            [$this, 'markLatexValue'],
            100
        );
    }

    /**
     * Shows chosen properties' entities as characters, and wraps a value holding LaTeX for the page script.
     */
    public function markLatexValue(Event $event)
    {
        $value = $event->getTarget();
        if ($value->type() !== 'literal') {
            return;
        }
        $services = $this->getServiceLocator();
        $settings = $services->get('Omeka\Settings');
        $term = $value->property()->term();
        $text = (string) $value->value();

        $decoded = false;
        $decodeTerms = (array) $settings->get('latexforomeka_decode_properties', []);
        if (in_array($term, $decodeTerms, true) && strpos($text, '&') !== false) {
            $clean = self::decodeEntities($text);
            if ($clean !== $text) {
                // Omeka's own literal rendering, of the text the transcriber meant.
                $text = $clean;
                $decoded = true;
                $event->setParam('html', nl2br($services->get('ViewRenderer')->escapeHtml($text)));
            }
        }

        $dollarMath = (bool) $settings->get('latexforomeka_dollar_math', false);
        if (!self::hasLatex($text, $dollarMath)) {
            return;
        }
        $terms = $settings->get('latexforomeka_properties', []);
        if ($terms && !in_array($term, (array) $terms, true)) {
            return;
        }
        $view = $services->get('ViewRenderer');
        $this->addAssets($view, $settings);
        $event->setParam('html', sprintf(
            '<div class="latex-for-omeka" data-latex-for-omeka="%s"%s%s>%s</div>',
            $view->escapeHtmlAttr($text),
            $dollarMath ? ' data-dollar-math="1"' : '',
            // Already decoded once: decoding again would turn a transcribed "&lt;" into "<".
            $decoded ? ' data-entities-decoded="1"' : '',
            $event->getParam('html')
        ));
    }

    /**
     * Scripto's import keeps the wiki's HTML entities ("&amp;"); only complete entities are decoded, so "AT&T" stays.
     */
    public static function decodeEntities($text)
    {
        return html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    /**
     * A cheap first look; the page script decides exactly what is LaTeX and leaves the rest as it was.
     */
    public static function hasLatex($text, $dollarMath = false)
    {
        if (preg_match('/\\\\(?:begin\{[A-Za-z]+\*?\}|\[|\()/', $text)) {
            return true;
        }
        return $dollarMath && strpos($text, '$') !== false;
    }

    private function addAssets(PhpRenderer $view, $settings)
    {
        if ($this->assetsAdded) {
            return;
        }
        $this->assetsAdded = true;
        $katex = trim((string) $settings->get('latexforomeka_katex_url', self::KATEX_CDN));
        if ($katex === '') {
            $css = $view->assetUrl('vendor/katex/katex.min.css', 'LatexForOmeka');
            $js = $view->assetUrl('vendor/katex/katex.min.js', 'LatexForOmeka');
        } else {
            $katex = rtrim($katex, '/') . '/';
            $css = $katex . 'katex.min.css';
            $js = $katex . 'katex.min.js';
        }
        $view->headLink()->appendStylesheet($css);
        $view->headLink()->appendStylesheet($view->assetUrl('css/latex-for-omeka.css', 'LatexForOmeka'));
        // Both deferred, so KaTeX is defined before the renderer runs.
        $view->headScript()->appendFile($js, 'text/javascript', ['defer' => 'defer']);
        $view->headScript()->appendFile(
            $view->assetUrl('js/latex-for-omeka.js', 'LatexForOmeka'),
            'text/javascript',
            ['defer' => 'defer']
        );
    }

    public function getConfigForm(PhpRenderer $renderer)
    {
        $services = $this->getServiceLocator();
        $settings = $services->get('Omeka\Settings');
        $form = $services->get('FormElementManager')->get(Form\ConfigForm::class);
        $form->setData([
            'latexforomeka_properties' => $settings->get('latexforomeka_properties', []),
            'latexforomeka_dollar_math' => $settings->get('latexforomeka_dollar_math', false) ? '1' : '0',
            'latexforomeka_katex_url' => $settings->get('latexforomeka_katex_url', self::KATEX_CDN),
            'latexforomeka_decode_properties' => $settings->get('latexforomeka_decode_properties', []),
        ]);
        return $renderer->formCollection($form, false);
    }

    public function handleConfigForm(AbstractController $controller)
    {
        $services = $this->getServiceLocator();
        $settings = $services->get('Omeka\Settings');
        $form = $services->get('FormElementManager')->get(Form\ConfigForm::class);
        $form->setData($controller->params()->fromPost());
        if (!$form->isValid()) {
            $controller->messenger()->addFormErrors($form);
            return false;
        }
        $data = $form->getData();
        $katex = trim((string) ($data['latexforomeka_katex_url'] ?? ''));
        if ($katex !== '' && !preg_match('~^https?://~i', $katex)) {
            $controller->messenger()->addError('The KaTeX location must be an http(s) address, or empty for the copy in the module.'); // @translate
            return false;
        }
        $terms = array_values(array_filter((array) ($data['latexforomeka_properties'] ?? [])));
        $settings->set('latexforomeka_properties', $terms);
        $settings->set('latexforomeka_dollar_math', !empty($data['latexforomeka_dollar_math']));
        $settings->set('latexforomeka_katex_url', $katex);
        $settings->set('latexforomeka_decode_properties',
            array_values(array_filter((array) ($data['latexforomeka_decode_properties'] ?? []))));
        return true;
    }
}
