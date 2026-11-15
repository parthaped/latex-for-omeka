<?php
namespace LatexForOmeka\Form;

use Laminas\Form\Element;
use Laminas\Form\Form;
use Omeka\Form\Element\PropertySelect;

class ConfigForm extends Form
{
    public function init()
    {
        $this->add([
            'name' => 'latexforomeka_properties',
            'type' => PropertySelect::class,
            'options' => [
                'label' => 'Properties to render', // @translate
                'info' => 'Only these properties are read for LaTeX, such as the transcription. Leave empty to read every text value.', // @translate
                'term_as_value' => true,
                'empty_option' => '',
            ],
            'attributes' => [
                'id' => 'latexforomeka_properties',
                'multiple' => true,
                'class' => 'chosen-select',
                'data-placeholder' => 'Every text value', // @translate
            ],
        ]);
        $this->add([
            'name' => 'latexforomeka_dollar_math',
            'type' => Element\Checkbox::class,
            'options' => [
                'label' => 'Read $…$ as math outside LaTeX blocks', // @translate
                'info' => 'Leave off for documents with dollar amounts. \(…\), \[…\] and \begin{…} always work, and inside a block $ is math as in LaTeX (write \$ for a dollar sign).', // @translate
            ],
            'attributes' => [
                'id' => 'latexforomeka_dollar_math',
            ],
        ]);
        $this->add([
            'name' => 'latexforomeka_katex_url',
            'type' => Element\Text::class,
            'options' => [
                'label' => 'KaTeX location', // @translate
                'info' => 'Where the math typesetter is loaded from. Leave empty to use the copy in the module\'s asset/vendor/katex folder.', // @translate
            ],
            'attributes' => [
                'id' => 'latexforomeka_katex_url',
            ],
        ]);

        $this->add([
            'name' => 'latexforomeka_decode_properties',
            'type' => PropertySelect::class,
            'options' => [
                'label' => 'Show HTML entities as characters in', // @translate
                'info' => 'Scripto\'s import stores "&" as "&amp;" and "<" as "&lt;", which pages then show literally. Choose its transcription property (usually scripto:transcription) to show the characters instead. The stored text, the API and search are unchanged.', // @translate
                'term_as_value' => true,
                'empty_option' => '',
            ],
            'attributes' => [
                'id' => 'latexforomeka_decode_properties',
                'multiple' => true,
                'class' => 'chosen-select',
                'data-placeholder' => 'No properties', // @translate
            ],
        ]);

        $inputFilter = $this->getInputFilter();
        $inputFilter->add(['name' => 'latexforomeka_decode_properties', 'required' => false]);
        $inputFilter->add(['name' => 'latexforomeka_properties', 'required' => false]);
        $inputFilter->add(['name' => 'latexforomeka_dollar_math', 'required' => false]);
        $inputFilter->add(['name' => 'latexforomeka_katex_url', 'required' => false]);
    }
}
